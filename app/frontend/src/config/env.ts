import {
  PESTISCAN_API_BASE_URL,
  PESTISCAN_API_PREFIX,
  PESTISCAN_BAND_BLUE,
  PESTISCAN_BAND_GREEN,
  PESTISCAN_BAND_NIR,
  PESTISCAN_BAND_RED,
  PESTISCAN_BAND_RED_BAND,
  PESTISCAN_MAX_TEXTURE_EDGE,
  PESTISCAN_MAX_TIFF_BYTES,
  PESTISCAN_READ_CHUNK_BYTES,
  PESTISCAN_REQUEST_TIMEOUT_MS,
  PESTISCAN_STRETCH_HIGH,
  PESTISCAN_STRETCH_LOW,
  PESTISCAN_UPLOAD_TIMEOUT_MS,
  PESTISCAN_ZOOM_MAX,
  PESTISCAN_ZOOM_MIN,
} from '@env';

function parseNumber(name: string, value: string): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return parsed;
}

function parseInteger(name: string, value: string): number {
  const parsed = parseNumber(name, value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer.`);
  }
  return parsed;
}

function parsePositiveInteger(name: string, value: string): number {
  const parsed = parseInteger(name, value);
  if (parsed <= 0) {
    throw new Error(`${name} must be greater than zero.`);
  }
  return parsed;
}

function parseNonNegativeInteger(name: string, value: string): number {
  const parsed = parseInteger(name, value);
  if (parsed < 0) {
    throw new Error(`${name} cannot be negative.`);
  }
  return parsed;
}

function parsePositiveNumber(name: string, value: string): number {
  const parsed = parseNumber(name, value);
  if (parsed <= 0) {
    throw new Error(`${name} must be greater than zero.`);
  }
  return parsed;
}

const apiBaseUrl = PESTISCAN_API_BASE_URL.trim().replace(/\/+$/, '');
if (!/^https?:\/\//i.test(apiBaseUrl)) {
  throw new Error('PESTISCAN_API_BASE_URL must be an absolute HTTP(S) URL.');
}

const apiPrefix = PESTISCAN_API_PREFIX.trim().replace(/\/+$/, '');
if (!apiPrefix.startsWith('/')) {
  throw new Error('PESTISCAN_API_PREFIX must start with "/".');
}

const stretchLow = parseNumber('PESTISCAN_STRETCH_LOW', PESTISCAN_STRETCH_LOW);
const stretchHigh = parseNumber('PESTISCAN_STRETCH_HIGH', PESTISCAN_STRETCH_HIGH);
if (stretchLow < 0 || stretchHigh > 1 || stretchLow >= stretchHigh) {
  throw new Error('TIFF stretch percentiles must satisfy 0 <= low < high <= 1.');
}

const zoomMin = parsePositiveNumber('PESTISCAN_ZOOM_MIN', PESTISCAN_ZOOM_MIN);
const zoomMax = parsePositiveNumber('PESTISCAN_ZOOM_MAX', PESTISCAN_ZOOM_MAX);
if (zoomMin >= zoomMax) {
  throw new Error('PESTISCAN_ZOOM_MIN must be less than PESTISCAN_ZOOM_MAX.');
}

export const config = {
  apiBaseUrl,
  apiPrefix,
  uploadTimeoutMs: parsePositiveInteger('PESTISCAN_UPLOAD_TIMEOUT_MS', PESTISCAN_UPLOAD_TIMEOUT_MS),
  requestTimeoutMs: parsePositiveInteger('PESTISCAN_REQUEST_TIMEOUT_MS', PESTISCAN_REQUEST_TIMEOUT_MS),
  defaultBandMapping: {
    red: parseNonNegativeInteger('PESTISCAN_BAND_RED', PESTISCAN_BAND_RED),
    green: parseNonNegativeInteger('PESTISCAN_BAND_GREEN', PESTISCAN_BAND_GREEN),
    blue: parseNonNegativeInteger('PESTISCAN_BAND_BLUE', PESTISCAN_BAND_BLUE),
    nir: parseNonNegativeInteger('PESTISCAN_BAND_NIR', PESTISCAN_BAND_NIR),
    redBand: parseNonNegativeInteger('PESTISCAN_BAND_RED_BAND', PESTISCAN_BAND_RED_BAND),
  },
  stretchPercentiles: { low: stretchLow, high: stretchHigh },
  maxTiffBytes: parsePositiveInteger('PESTISCAN_MAX_TIFF_BYTES', PESTISCAN_MAX_TIFF_BYTES),
  maxTextureEdge: parsePositiveInteger('PESTISCAN_MAX_TEXTURE_EDGE', PESTISCAN_MAX_TEXTURE_EDGE),
  readChunkBytes: parsePositiveInteger('PESTISCAN_READ_CHUNK_BYTES', PESTISCAN_READ_CHUNK_BYTES),
  zoom: { min: zoomMin, max: zoomMax },
} as const;

export const apiUrl = (path: string): string =>
  `${config.apiBaseUrl}${config.apiPrefix}${path.startsWith('/') ? path : `/${path}`}`;

export default config;
