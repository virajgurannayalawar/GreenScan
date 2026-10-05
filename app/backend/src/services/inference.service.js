'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const tiffService = require('./tiff.service');
const onnxService = require('./onnx.service');

const DEFAULT_MAPPING = Object.freeze({
  // 0-based band indices for the false-colour preview the gate model sees.
  // Matches the client default: NIR -> R, RedEdge -> G, Green -> B.
  red: 3,
  green: 4,
  blue: 1,
});

function classifyLevel(percent) {
  if (percent < 1) return 'none';
  if (percent < 10) return 'low';
  if (percent < 25) return 'moderate';
  if (percent < 45) return 'high';
  return 'severe';
}

function buildMessage({ status, rejectionReason, pesticide }) {
  if (status === 'rejected') {
    if (rejectionReason === 'not_vegetable') {
      return 'This does not look like a vegetable. Point the scanner at produce and capture again.';
    }
    return 'The image is too unclear to score. Hold the device steady, avoid glare, and capture again.';
  }

  const level = pesticide.level;
  const percent = pesticide.percent.toFixed(1);

  switch (level) {
    case 'none':
      return `No meaningful pesticide residue detected (${percent}%).`;
    case 'low':
      return `Low pesticide residue detected (${percent}%). Within typical safe handling range.`;
    case 'moderate':
      return `Moderate pesticide residue detected (${percent}%). Washing is recommended before consumption.`;
    case 'high':
      return `High pesticide residue detected (${percent}%). Thorough washing or peeling is advised.`;
    default:
      return `Severe pesticide residue detected (${percent}%). Do not consume without further testing.`;
  }
}

/**
 * Full analysis pipeline for one uploaded multispectral TIFF.
 *
 * Order matters: the cheap checks gate the expensive ones. Decode, then a
 * focus/saturation check, then the vegetable classifier, and only then the
 * residue regressor. A blurry photo of a brick never reaches the regressor.
 *
 * @param {Buffer} buffer
 * @param {{ bandMapping?: {red:number,green:number,blue:number} }} [options]
 */
async function analyseTiff(buffer, options = {}) {
  const startedAt = Date.now();
  const mapping = { ...DEFAULT_MAPPING, ...(options.bandMapping || {}) };

  const raster = await tiffService.decodeMultispectralTiff(buffer);

  const rasterMeta = {
    width: raster.width,
    height: raster.height,
    bandCount: raster.bandCount,
    bitsPerSample: raster.bitsPerSample,
    sampleFormat: raster.sampleFormat,
    compression: raster.compression,
  };

  // Focus metric on the band most likely to hold leaf texture.
  const nirIndex = Math.min(mapping.red, raster.bands.length - 1);
  const quality = tiffService.assessQuality(raster, nirIndex);
  quality.isClear = quality.sharpness >= env.SHARPNESS_THRESHOLD && quality.saturatedRatio < 0.35;

  if (!quality.isClear) {
    const result = {
      status: 'rejected',
      rejectionReason: 'unclear_image',
      raster: rasterMeta,
      quality,
      classification: { isVegetable: false, label: 'unknown', confidence: 0 },
      pesticide: undefined,
      inference: {
        engine: 'n/a',
        durationMs: Date.now() - startedAt,
        modelVersions: onnxService.describeModels(),
      },
    };
    result.message = buildMessage(result);
    logger.info('inference.rejected', { reason: 'unclear_image', sharpness: quality.sharpness });
    return result;
  }

  const previewTensor = tiffService.buildPreviewTensorData(raster, mapping);
  const gate = await onnxService.runVegetableGate(previewTensor);

  const classification = {
    isVegetable: gate.label === 'vegetable',
    label: gate.label,
    confidence: gate.probability,
  };

  if (!classification.isVegetable) {
    const result = {
      status: 'rejected',
      rejectionReason: 'not_vegetable',
      raster: rasterMeta,
      quality,
      classification,
      pesticide: undefined,
      inference: {
        engine: gate.engine,
        durationMs: Date.now() - startedAt,
        modelVersions: onnxService.describeModels(),
      },
    };
    result.message = buildMessage(result);
    logger.info('inference.rejected', {
      reason: 'not_vegetable',
      confidence: classification.confidence,
    });
    return result;
  }

  const residueTensor = tiffService.buildResidueTensorData(raster);
  const residue = await onnxService.runResidueRegressor(residueTensor);

  const pesticide = {
    percent: residue.percent,
    level: classifyLevel(residue.percent),
    confidence: residue.confidence ?? classification.confidence,
  };

  const result = {
    status: 'ok',
    rejectionReason: null,
    raster: rasterMeta,
    quality,
    classification,
    pesticide,
    inference: {
      engine: residue.engine,
      durationMs: Date.now() - startedAt,
      modelVersions: onnxService.describeModels(),
    },
  };
  result.message = buildMessage(result);

  logger.info('inference.ok', {
    percent: pesticide.percent,
    level: pesticide.level,
    durationMs: result.inference.durationMs,
  });

  return result;
}

module.exports = { analyseTiff, classifyLevel, DEFAULT_MAPPING };
