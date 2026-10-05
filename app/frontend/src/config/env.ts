import { Platform } from 'react-native';

/**
 * Where the backend lives, per platform.
 *
 * Android's emulator cannot reach the host's `localhost` — 10.0.2.2 is the
 * loopback alias it exposes. On a physical device replace this with your
 * machine's LAN address.
 */
const DEFAULT_API_BASE_URL = Platform.select({
  android: 'http://10.58.25.105:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000',
}) as string;

export const config = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  apiPrefix: '/api/v1',

  /** Upload timeout. Multispectral TIFFs are large; be generous. */
  uploadTimeoutMs: 120_000,
  requestTimeoutMs: 20_000,

  /**
   * Default band indices (0-based) for the false-colour composite.
   *
   * Assumes the common 5-band agricultural sensor layout:
   *   0 Blue · 1 Green · 2 Red · 3 NIR · 4 Red Edge
   *
   * The spec's mapping is therefore: NIR(3) -> screen R, RedEdge(4) -> screen G,
   * Green(1) -> screen B. Override per-sensor from the Profile tab.
   */
  defaultBandMapping: {
    red: 3,
    green: 4,
    blue: 1,
    nir: 3,
    redBand: 2,
  },

  /**
   * Percentile clip used for the per-band contrast stretch. Raw multispectral
   * reflectance occupies a narrow slice of the 16-bit range, so rendering the
   * full min..max produces a nearly black image.
   */
  stretchPercentiles: { low: 0.02, high: 0.98 },

  /** Decoder guard rails. */
  maxTiffBytes: 80 * 1024 * 1024,
  /** Downsample anything larger than this on the longest edge before packing. */
  maxTextureEdge: 2048,
  /** Bytes read per native slice during the streaming decode. */
  readChunkBytes: 1 << 20,

  /** Pinch-to-zoom bounds on the viewer. */
  zoom: { min: 0.5, max: 12 },
} as const;

export const apiUrl = (path: string): string =>
  `${config.apiBaseUrl}${config.apiPrefix}${path.startsWith('/') ? path : `/${path}`}`;

export default config;
