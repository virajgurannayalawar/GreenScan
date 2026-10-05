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
    bands,
    maxValue,
  };
}

/**
 * Nearest-neighbour resize of a single plane. Nearest-neighbour is deliberate:
 * it is allocation-free per pixel and preserves raw radiometric values, which
 * matters more than smoothness for band-ratio features.
 */
function resizePlane(plane, srcWidth, srcHeight, dstWidth, dstHeight) {
  const out = new Float32Array(dstWidth * dstHeight);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = Math.min(srcHeight - 1, Math.floor(y * yRatio));
    const srcRow = srcY * srcWidth;
    const dstRow = y * dstWidth;
    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = Math.min(srcWidth - 1, Math.floor(x * xRatio));
      out[dstRow + x] = plane[srcRow + srcX];
    }
  }

  return out;
}

/**
 * Build the pseudo-RGB preview the vegetable gate consumes.
 * Band indices are 0-based into `raster.bands`.
 */
function buildPreviewTensorData(raster, mapping) {
  const { bands, width, height } = raster;
  const pick = (index, fallback) => bands[index] ?? bands[fallback] ?? bands[0];

  const planes = [
    pick(mapping.red, 0),
    pick(mapping.green, Math.min(1, bands.length - 1)),
    pick(mapping.blue, Math.min(2, bands.length - 1)),
  ].map((plane) => resizePlane(plane, width, height, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE));

  // NCHW float32, ImageNet-normalised — the convention almost every
  // torchvision/timm export expects.
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const pixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const data = new Float32Array(3 * pixels);

  for (let c = 0; c < 3; c += 1) {
    const plane = planes[c];
    const offset = c * pixels;
    for (let i = 0; i < pixels; i += 1) {
      data[offset + i] = (plane[i] - mean[c]) / std[c];
    }
  }

  return { data, dims: [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE] };
}

/**
 * Build the full multi-band tensor the residue regressor consumes.
 * Every available band is forwarded so the model can use NDVI-style ratios.
 */
function buildResidueTensorData(raster) {
  const { bands, width, height } = raster;
  const channels = bands.length;
  const pixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const data = new Float32Array(channels * pixels);

  for (let c = 0; c < channels; c += 1) {
    const resized = resizePlane(bands[c], width, height, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    data.set(resized, c * pixels);
  }

  return { data, dims: [1, channels, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE] };
}

/**
 * Variance of the Laplacian — the standard cheap focus metric. Computed on the
 * NIR-ish band because it carries the most leaf texture.
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
  buildPreviewTensorData,
  buildResidueTensorData,
  assessQuality,
  resizePlane,
};
