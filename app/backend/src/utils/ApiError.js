'use strict';

class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code ?? 'error';
    this.details = options.details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, options) {
    return new ApiError(400, message, { code: 'bad_request', ...options });
  }

  static notFound(message = 'Resource not found', options) {
    return new ApiError(404, message, { code: 'not_found', ...options });
  }

  static payloadTooLarge(message, options) {
    return new ApiError(413, message, { code: 'payload_too_large', ...options });
  }

  static unsupportedMedia(message, options) {
    return new ApiError(415, message, { code: 'unsupported_media_type', ...options });
  }

  static internal(message = 'Internal server error', options) {
    return new ApiError(500, message, { code: 'internal_error', ...options });
  }
}

module.exports = ApiError;
