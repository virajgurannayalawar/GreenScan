'use strict';

const { v2: cloudinary } = require('cloudinary');
const env = require('./env');
const logger = require('../utils/logger');

if (env.cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('cloudinary.configured', { cloudName: env.CLOUDINARY_CLOUD_NAME });
} else {
  logger.warn('cloudinary.not_configured', {
    hint: 'Set CLOUDINARY_* in .env. Uploads will be skipped until then.',
  });
}

module.exports = cloudinary;
