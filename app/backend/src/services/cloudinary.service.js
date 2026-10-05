'use strict';

const { Readable } = require('node:stream');
const cloudinary = require('../config/cloudinary');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Stream a buffer to Cloudinary.
 *
 * `resource_type: 'raw'` is deliberate: Cloudinary's image pipeline does not
 * understand multi-band TIFF, and letting it try would either fail or silently
 * flatten the extra bands away. Raw keeps the archived file byte-identical to
 * what the sensor produced.
 */
function uploadBuffer(buffer, { filename, folder = env.CLOUDINARY_FOLDER, context } = {}) {
  if (!env.cloudinaryConfigured) {
    return Promise.resolve({
      skipped: true,
      skipReason: 'cloudinary_not_configured',
      provider: 'cloudinary',
    });
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'raw',
        public_id: filename ? filename.replace(/\.[^.]+$/, '') : undefined,
        use_filename: Boolean(filename),
        unique_filename: true,
        overwrite: false,
        context,
      },
      (error, result) => {
        if (error) {
          logger.error('cloudinary.upload_failed', { message: error.message });
          reject(error);
          return;
        }
        resolve({
          skipped: false,
          provider: 'cloudinary',
          publicId: result.public_id,
          secureUrl: result.secure_url,
          resourceType: result.resource_type,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

async function destroyAsset(publicId) {
  if (!env.cloudinaryConfigured || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  } catch (error) {
    logger.warn('cloudinary.destroy_failed', { publicId, message: error.message });
  }
}

module.exports = { uploadBuffer, destroyAsset };
