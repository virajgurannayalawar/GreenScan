'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
function errorHandler(error, req, res, next) {
  const statusCode = error instanceof ApiError ? error.statusCode : error.statusCode || 500;
  const code = error.code || (statusCode >= 500 ? 'internal_error' : 'error');

  if (statusCode >= 500) {
    logger.error('request.failed', {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
      stack: error.stack,
    });
  } else {
    logger.warn('request.rejected', {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      message: error.message,
    });
  }

  res.status(statusCode).json({
    status: 'error',
    code,
    message:
      statusCode >= 500 && env.isProduction
        ? 'Something went wrong processing the request.'
        : error.message,
    details: env.isProduction ? undefined : error.details,
  });
}

module.exports = { notFound, errorHandler };
