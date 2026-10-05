'use strict';

const ApiError = require('../utils/ApiError');

// `geotiff` ships as ESM-only from v2, so it is imported lazily via dynamic
// import and cached. This keeps the rest of the backend on CommonJS.
let geotiffModule = null;
async function loadGeoTIFF() {
  if (!geotiffModule) {
    geotiffModule = await import('geotiff');
  }
  return geotiffModule;
}

const MODEL_INPUT_SIZE = 224;

/**
 * Decode a multispectral TIFF buffer into normalised band planes plus metadata.
 *
 * @param {Buffer} buffer raw .tif/.tiff bytes
 * @returns {Promise<{
 *   width: number,
 *   height: number,
 *   bandCount: number,
 *   bitsPerSample: number,
 *   sampleFormat: string,
 *   compression: number,
 *   bands: Float32Array[],   // each plane normalised to 0..1, length width*height
 *   maxValue: number,
 * }>}
 */
async function decodeMultispectralTiff(buffer) {
  const { fromArrayBuffer } = await loadGeoTIFF();

  let tiff;
  try {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    tiff = await fromArrayBuffer(arrayBuffer);
  } catch (error) {
    throw ApiError.badRequest('File is not a readable TIFF.', {
      code: 'tiff_parse_failed',
      details: error.message,
    });
  }

  const image = await tiff.getImage(0);
  const width = image.getWidth();
  const height = image.getHeight();
  const bandCount = image.getSamplesPerPixel();
  const bitsPerSample = image.getBitsPerSample?.() ?? 8;
  const compression = image.fileDirectory?.Compression ?? 1;
  const photometricInterpretation = image.fileDirectory?.PhotometricInterpretation ?? null;
  const sampleFormatCode = image.fileDirectory?.SampleFormat?.[0] ?? 1;
  const sampleFormat = sampleFormatCode === 3 ? 'float' : sampleFormatCode === 2 ? 'int' : 'uint';

  if (!width || !height) {
    throw ApiError.badRequest('TIFF reports a zero-sized raster.', { code: 'tiff_empty' });
  }

  let rasters;
  try {
    // `interleave: false` gives us one typed array per band (planar output),
    // which is what both the quality checks and the tensor builders want.
    rasters = await image.readRasters({ interleave: false });
  } catch (error) {
    throw ApiError.badRequest(
      'TIFF uses a compression or layout this server cannot decode.',
      { code: 'tiff_decode_failed', details: error.message },
    );
  }

  const maxValue = sampleFormat === 'float' ? 1 : 2 ** bitsPerSample - 1;

  const bands = Array.from({ length: rasters.length }, (_, index) => {
    const source = rasters[index];
    const plane = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 1) {
      plane[i] = source[i] / maxValue;
    }
    return plane;
  });

  return {
    width,
    height,
    bandCount: bands.length || bandCount,
    bitsPerSample: Array.isArray(bitsPerSample) ? bitsPerSample[0] : bitsPerSample,
    sampleFormat,
    compression,
    photometricInterpretation,
    bands,
    maxValue,
  };
}

function resizeWeights(sourceSize, targetSize) {
  const scale = sourceSize / targetSize;
  const filterScale = Math.max(scale, 1);
  const weights = new Array(targetSize);

  for (let target = 0; target < targetSize; target += 1) {
    const center = (target + 0.5) * scale;
    const start = Math.max(0, Math.ceil(center - filterScale - 0.5));
    const end = Math.min(sourceSize, Math.floor(center + filterScale - 0.5) + 1);
    const samples = [];
    let total = 0;

    for (let source = start; source < end; source += 1) {
      const distance = Math.abs(source + 0.5 - center) / filterScale;
      const weight = Math.max(0, 1 - distance);
      if (weight > 0) {
        samples.push([source, weight]);
        total += weight;
      }
    }

    weights[target] = samples.map(([source, weight]) => [source, weight / total]);
  }

  return weights;
}

/**
 * Pillow's default bilinear Resize applies a triangular filter widened for
 * downsampling. Keep that behavior for the RGB classifier's training match.
 */
function resizePlaneBilinear(plane, srcWidth, srcHeight, dstWidth, dstHeight) {
  const xWeights = resizeWeights(srcWidth, dstWidth);
  const yWeights = resizeWeights(srcHeight, dstHeight);
  const horizontal = new Float32Array(dstWidth * srcHeight);
  const out = new Float32Array(dstWidth * dstHeight);

  for (let y = 0; y < srcHeight; y += 1) {
    for (let x = 0; x < dstWidth; x += 1) {
      let value = 0;
      for (const [sourceX, weight] of xWeights[x]) {
        value += plane[y * srcWidth + sourceX] * weight;
      }
      horizontal[y * dstWidth + x] = value;
    }
  }

  for (let y = 0; y < dstHeight; y += 1) {
    for (let x = 0; x < dstWidth; x += 1) {
      let value = 0;
      for (const [sourceY, weight] of yWeights[y]) {
        value += horizontal[sourceY * dstWidth + x] * weight;
      }
      out[y * dstWidth + x] = value;
    }
  }

  return out;
}

/**
 * Match the apple classifier's torchvision RGB TIFF preprocessing. Return
 * null for rasters outside the model's 8-bit, three-channel RGB training input.
 */
function buildAppleClassifierTensorData(raster) {
  const { bands, width, height } = raster;
  if (
    bands.length !== 3 ||
    raster.photometricInterpretation !== 2 ||
    raster.bitsPerSample !== 8 ||
    raster.sampleFormat !== 'uint'
  ) {
    return null;
  }

  const pixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const means = [0.485, 0.456, 0.406];
  const stds = [0.229, 0.224, 0.225];
  const data = new Float32Array(3 * pixels);

  for (let channel = 0; channel < 3; channel += 1) {
    const resized = resizePlaneBilinear(
      bands[channel],
      width,
      height,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    );
    const offset = channel * pixels;

    for (let i = 0; i < pixels; i += 1) {
      const pixel = Math.round(Math.min(1, Math.max(0, resized[i])) * 255) / 255;
      data[offset + i] = (pixel - means[channel]) / stds[channel];
    }
  }

  return { data, dims: [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE] };
}

/**
 * Variance of the Laplacian — the standard cheap focus metric. Computed on the
 * first RGB channel.
 *
 * Also reports the share of blown-out pixels, which catches the "photographed
 * into the sun" case that a sharpness number alone would pass.
 */
function assessQuality(raster, bandIndex = 0) {
  const { width, height } = raster;
  const plane = raster.bands[bandIndex] ?? raster.bands[0];

  if (width < 3 || height < 3) {
    return { sharpness: 0, isClear: false, saturatedRatio: 0 };
  }

  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  let saturated = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const laplacian =
        4 * plane[i] - plane[i - 1] - plane[i + 1] - plane[i - width] - plane[i + width];
      // Scale to 0..255 so the threshold reads like the OpenCV values people
      // are used to quoting for this metric.
      const scaled = laplacian * 255;
      sum += scaled;
      sumSquares += scaled * scaled;
      count += 1;
      if (plane[i] >= 0.995) saturated += 1;
    }
  }

  const mean = sum / count;
  const variance = sumSquares / count - mean * mean;
  const sharpness = Number(Math.max(0, variance).toFixed(2));
  const saturatedRatio = Number((saturated / count).toFixed(4));

  return { sharpness, saturatedRatio, isClear: null };
}

module.exports = {
  MODEL_INPUT_SIZE,
  decodeMultispectralTiff,
  buildAppleClassifierTensorData,
  assessQuality,
};
