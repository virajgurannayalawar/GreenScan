'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const tiffService = require('./tiff.service');
const onnxService = require('./onnx.service');

function buildMessage({ rejectionReason, appleClassification }) {
  if (rejectionReason === 'unclear_image') {
    return 'The image is too unclear to classify. Use a sharp image without glare.';
  }
  if (rejectionReason === 'unsupported_format') {
    return 'The apple classifier accepts 8-bit RGB TIFF images only.';
  }

  return `Apple dataset class: ${appleClassification.label}.`;
}

/**
 * Classify an uploaded apple TIFF using the dataset's Fresh/High/Low labels.
 * Residue estimation is intentionally disabled until a validated model exists.
 *
 * @param {Buffer} buffer
 */
async function analyseTiff(buffer) {
  const startedAt = Date.now();
  const raster = await tiffService.decodeMultispectralTiff(buffer);

  const rasterMeta = {
    width: raster.width,
    height: raster.height,
    bandCount: raster.bandCount,
    bitsPerSample: raster.bitsPerSample,
    sampleFormat: raster.sampleFormat,
    compression: raster.compression,
  };

  const quality = tiffService.assessQuality(raster, 0);
  quality.isClear = quality.sharpness >= env.SHARPNESS_THRESHOLD && quality.saturatedRatio < 0.35;

  const appleTensor = tiffService.buildAppleClassifierTensorData(raster);
  const rejectionReason = !quality.isClear
    ? 'unclear_image'
    : appleTensor
      ? null
      : 'unsupported_format';

  if (rejectionReason) {
    const result = {
      status: 'rejected',
      rejectionReason,
      raster: rasterMeta,
      quality,
      appleClassification: undefined,
      inference: {
        engine: 'n/a',
        durationMs: Date.now() - startedAt,
        modelVersions: onnxService.describeModels(),
      },
    };
    result.message = buildMessage(result);
    logger.info('inference.rejected', { reason: rejectionReason, sharpness: quality.sharpness });
    return result;
  }

  const appleClassification = await onnxService.runAppleQualityClassifier(appleTensor);
  const result = {
    status: 'ok',
    rejectionReason: null,
    raster: rasterMeta,
    quality,
    appleClassification: {
      label: appleClassification.label,
      confidence: appleClassification.confidence,
    },
    inference: {
      engine: appleClassification.engine,
      durationMs: Date.now() - startedAt,
      modelVersions: onnxService.describeModels(),
    },
  };
  result.message = buildMessage(result);

  logger.info('inference.apple_classified', {
    label: appleClassification.label,
    confidence: appleClassification.confidence,
    durationMs: result.inference.durationMs,
  });

  return result;
}

module.exports = { analyseTiff };
