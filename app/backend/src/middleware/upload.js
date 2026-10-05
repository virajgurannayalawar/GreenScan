'use strict';

const multer = require('multer');
const path = require('node:path');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED_EXTENSIONS = new Set(['.tif', '.tiff']);
const ALLOWED_MIME_TYPES = new Set([
  'image/tiff',
  'image/tif',
  'image/x-tiff',
  // Android's document provider frequently reports this for .tif files.
  'application/octet-stream',
]);

/**
 * Memory storage is the right call here: the buffer is needed twice in quick
 * succession (Cloudinary stream + ONNX decode), and writing it to disk first
 * would only add I/O. MAX_UPLOAD_BYTES is the backstop.
 */
const storage = multer.memoryStorage();

function fileFilter(req, file, callback) {
  const extension = path.extname(file.originalname || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    callback(
      ApiError.unsupportedMedia(
        `Only .tif/.tiff uploads are accepted (received "${extension || 'no extension'}").`,
      ),
    );
    return;
  }

  if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(ApiError.unsupportedMedia(`Unsupported content type "${file.mimetype}".`));
    return;
  }

  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_UPLOAD_BYTES,
    files: 1,
    fields: 10,
  },
});

/** Wraps multer so its own errors become ApiError instances. */
function singleTiff(fieldName = 'file') {
  const handler = upload.single(fieldName);
  return function middleware(req, res, next) {
    handler(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(
            ApiError.payloadTooLarge(
              `File exceeds the ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
            ),
          );
          return;
        }
        next(ApiError.badRequest(`Upload rejected: ${error.message}`, { code: error.code }));
        return;
      }
      next(error);
    });
  };
}

module.exports = { singleTiff };
