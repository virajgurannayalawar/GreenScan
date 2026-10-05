/** Shared domain types for PestiScan. */

/* ------------------------------------------------------------------ camera */

export type CameraCapability = 'multispectral' | 'rgb-only' | 'unavailable' | 'denied';

export interface CameraProbeReport {
  capability: CameraCapability;
  /** Count of devices returned by getAvailableCameraDevices(). */
  deviceCount: number;
  /** Device ids/names we inspected — surfaced in the UI for transparency. */
  inspected: Array<{
    id: string;
    name: string;
    position: string;
    physicalDevices: string[];
  }>;
  /** Why we landed on this capability, shown to the user verbatim. */
  reason: string;
}

/* -------------------------------------------------------------------- file */

export interface PickedTiff {
  /** Local filesystem path (not a content:// uri) — safe for native reads. */
  path: string;
  /** Original uri as returned by the picker, kept for debugging. */
  uri: string;
  name: string;
  size: number;
  mimeType: string | null;
}

/* ------------------------------------------------------- raster / decoding */

export interface TiffMetadata {
  width: number;
  height: number;
  bandCount: number;
  bitsPerSample: number;
  sampleFormat: 'uint' | 'int' | 'float';
  compression: number;
  planarConfig: number;
  littleEndian: boolean;
  byteLength: number;
}

/** Per-band contrast stretch bounds, in normalised 0..1 space. */
export interface BandStretch {
  lo: number;
  hi: number;
}

/**
 * The GPU-ready result of decoding. Bands are packed into up to two opaque
 * RGB textures — see services/bandPacker.ts for why two.
 */
export interface PackedBands {
  metadata: TiffMetadata;
  /** RGBA8 bytes, width*height*4. Channels hold bands 0,1,2; alpha is 255. */
  textureA: Uint8Array;
  /** Same layout for bands 3,4,5. Null when the file has <= 3 bands. */
  textureB: Uint8Array | null;
  width: number;
  height: number;
  /** Stretch bounds per packed band index (0..5). */
  stretches: BandStretch[];
  decodeMs: number;
}

/** Which raw band index drives each output screen channel. */
export interface BandMapping {
  red: number;
  green: number;
  blue: number;
  /** Used by the NDVI render mode. */
  nir: number;
  redBand: number;
}

export type RenderMode = 'false-color' | 'ndvi';

/* ----------------------------------------------------------------- backend */

export type ScanStatus = 'ok' | 'rejected' | 'failed';
export type RejectionReason = 'not_vegetable' | 'unclear_image' | null;
export type ResidueLevel = 'none' | 'low' | 'moderate' | 'high' | 'severe';

export interface ScanResult {
  id: string;
  clientScanId?: string;
  status: ScanStatus;
  rejectionReason: RejectionReason;
  message: string;
  originalFilename?: string;
  sizeBytes?: number;
  raster?: {
    width: number;
    height: number;
    bandCount: number;
    bitsPerSample: number;
    sampleFormat: string;
    compression: number;
  };
  asset?: {
    secureUrl?: string;
    publicId?: string;
    bytes?: number;
    skipped?: boolean;
  };
  classification?: {
    isVegetable: boolean;
    label: string;
    confidence: number;
  };
  quality?: {
    sharpness: number;
    isClear: boolean;
    saturatedRatio: number;
  };
  pesticide?: {
    percent: number;
    level: ResidueLevel;
    confidence: number;
  };
  inference?: {
    engine: string;
    durationMs: number;
    modelVersions?: Record<string, string>;
  };
  capturedAt?: string;
  createdAt?: string;
}

export interface HistoryPage {
  items: ScanResult[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface HistorySummary {
  total: number;
  scored: number;
  rejected: number;
  averagePercent: number | null;
  maxPercent: number | null;
  lastScanAt: string | null;
  byLevel: Partial<Record<ResidueLevel, number>>;
}

export interface Profile {
  id: string;
  deviceId: string;
  displayName: string;
  email?: string;
  organisation?: string;
  role?: string;
  region?: string;
  preferences: {
    units: 'ppm' | 'percent';
    bandMapping: { red: number; green: number; blue: number };
  };
  stats: {
    totalScans: number;
    rejectedScans: number;
    lastScanAt?: string;
  };
  createdAt?: string;
}

/* ------------------------------------------------------------------- flow */

export type ScanPhase =
  | 'idle'
  | 'probing-camera'
  | 'awaiting-file'
  | 'decoding'
  | 'ready'
  | 'error';

export interface ScanError {
  stage: 'camera' | 'picker' | 'decode' | 'upload';
  message: string;
  detail?: string;
}
