'use strict';

const onnxService = require('./onnx.service');
const tiffService = require('./tiff.service');
const ApiError = require('../utils/ApiError');

async function validateApple(buffer) {
  const raster = await tiffService.decodeMultispectralTiff(buffer);
  const tensor = tiffService.buildAppleClassifierTensorData(raster);

  if (!tensor) {
    throw ApiError.badRequest('Apple validation supports 8-bit RGB TIFF images only.', {
      code: 'unsupported_format',
    });
  }

  const result = await onnxService.runAppleGateClassifier(tensor);
  if (!result.isApple) {
    throw ApiError.badRequest('This image does not contain an apple. Please upload an apple image.', {
      code: 'not_apple',
    });
  }

  return result;
}

module.exports = { validateApple };
