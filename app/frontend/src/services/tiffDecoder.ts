import config from '../config/env';
import { NativeFileReader } from './nativeFile';
import type { BandStretch, PackedBands, TiffMetadata } from '../types';

/**
 * Streaming multispectral TIFF decoder.
 *
 * Scope and intent
 * ----------------
 * This reads *uncompressed* baseline TIFF — which is what every multispectral
 * sensor writes natively, because the per-band radiometry is the point and
 * lossy/entropy compression gets in the way. It parses the IFD from a few
 * kilobytes, then streams the pixel data through 1 MB native windows, writing
 * directly into the GPU-bound textures. Nothing larger than one window plus the
 * output textures is ever resident in the JS heap.
 *
 * LZW / Deflate / JPEG-in-TIFF are rejected here with a clear error, and the
 * backend (which has `geotiff` and no mobile memory ceiling) handles those.
 * See `docs/` note in the project README.
 *
 * What it deliberately does NOT do
 * --------------------------------
 * No per-pixel colour maths. The decoder's only job is to get raw band values
 * onto the GPU as texture channels; the NIR/RedEdge/Green remap happens in the
 * SkSL shader (see shaders/falseColor.ts) where it costs ~1 ms instead of the
 * seconds a JavaScript pixel loop would take.
 */

/* ------------------------------------------------------------------ tags */

const TAG = {
  IMAGE_WIDTH: 256,
  IMAGE_LENGTH: 257,
  BITS_PER_SAMPLE: 258,
  COMPRESSION: 259,
  PHOTOMETRIC: 262,
  STRIP_OFFSETS: 273,
  SAMPLES_PER_PIXEL: 277,
  ROWS_PER_STRIP: 278,
  STRIP_BYTE_COUNTS: 279,
  PLANAR_CONFIG: 284,
  SAMPLE_FORMAT: 339,
} as const;

const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

const COMPRESSION_NAMES: Record<number, string> = {
  1: 'none',
  5: 'LZW',
  6: 'JPEG (old-style)',
  7: 'JPEG',
  8: 'Deflate (Adobe)',
  32773: 'PackBits',
  32946: 'Deflate',
};

/** Histogram resolution for the percentile contrast stretch. */
const HISTOGRAM_BINS = 1024;

/** Hard cap on samples retained per band, to bound texture memory. */
const MAX_SAMPLES_PER_BAND = 4_000_000;

/** Up to six bands fit in two opaque RGB textures. */
export const MAX_PACKED_BANDS = 6;

export class TiffDecodeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TiffDecodeError';
    this.code = code;
  }
}

/* -------------------------------------------------------------- IFD parse */

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Already-resolved numeric values. */
  values: number[];
}

function readNumber(view: DataView, offset: number, type: number, littleEndian: boolean): number {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return view.getUint8(offset);
    case 3:
      return view.getUint16(offset, littleEndian);
    case 4:
      return view.getUint32(offset, littleEndian);
    case 6:
      return view.getInt8(offset);
    case 8:
      return view.getInt16(offset, littleEndian);
    case 9:
      return view.getInt32(offset, littleEndian);
    case 11:
      return view.getFloat32(offset, littleEndian);
    case 12:
      return view.getFloat64(offset, littleEndian);
    case 5:
    case 10: {
      const numerator = view.getUint32(offset, littleEndian);
      const denominator = view.getUint32(offset + 4, littleEndian);
      return denominator === 0 ? 0 : numerator / denominator;
    }
    default:
      throw new TiffDecodeError('unknown_field_type', `Unsupported TIFF field type ${type}.`);
  }
}

async function parseIfd(
  reader: NativeFileReader,
  ifdOffset: number,
  littleEndian: boolean,
): Promise<Map<number, IfdEntry>> {
  const countView = await reader.readView(ifdOffset, 2);
  const entryCount = countView.getUint16(0, littleEndian);

  if (entryCount === 0 || entryCount > 2048) {
    throw new TiffDecodeError('bad_ifd', `IFD reports an implausible entry count (${entryCount}).`);
  }

  // One native read for the whole entry table — typically well under 8 KB.
  const tableBytes = await reader.readRange(ifdOffset + 2, entryCount * 12);
  const table = new DataView(tableBytes.buffer, tableBytes.byteOffset, tableBytes.byteLength);

  const entries = new Map<number, IfdEntry>();
  // Values that live outside the 4-byte inline slot, fetched after the loop so
  // the sliding window is not thrashed mid-parse.
  const deferred: Array<{ tag: number; type: number; count: number; offset: number }> = [];

  for (let i = 0; i < entryCount; i += 1) {
    const base = i * 12;
    const tag = table.getUint16(base, littleEndian);
    const type = table.getUint16(base + 2, littleEndian);
    const count = table.getUint32(base + 4, littleEndian);
    const typeSize = TYPE_SIZE[type];

    if (!typeSize) {
      // Unknown types are skipped rather than fatal — TIFF is full of private tags.
      continue;
    }

    const totalBytes = typeSize * count;

    if (totalBytes <= 4) {
      const values: number[] = [];
      for (let v = 0; v < count; v += 1) {
        values.push(readNumber(table, base + 8 + v * typeSize, type, littleEndian));
      }
      entries.set(tag, { tag, type, count, values });
    } else {
      deferred.push({
        tag,
        type,
        count,
        offset: table.getUint32(base + 8, littleEndian),
      });
    }
  }

  for (const item of deferred) {
    const typeSize = TYPE_SIZE[item.type];
    const bytes = await reader.readRange(item.offset, typeSize * item.count);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values: number[] = new Array(item.count);
    for (let v = 0; v < item.count; v += 1) {
      values[v] = readNumber(view, v * typeSize, item.type, littleEndian);
    }
    entries.set(item.tag, { tag: item.tag, type: item.type, count: item.count, values });
  }

  return entries;
}

function requireTag(entries: Map<number, IfdEntry>, tag: number, label: string): IfdEntry {
  const entry = entries.get(tag);
  if (!entry) {
    throw new TiffDecodeError('missing_tag', `TIFF is missing the required ${label} tag.`);
  }
  return entry;
}

/* ------------------------------------------------------------- metadata */

export interface TiffLayout extends TiffMetadata {
  rowsPerStrip: number;
  stripOffsets: number[];
  stripByteCounts: number[];
  bytesPerSample: number;
}

export async function readTiffLayout(reader: NativeFileReader): Promise<TiffLayout> {
  if (reader.size < 8) {
    throw new TiffDecodeError('too_small', 'File is too small to be a TIFF.');
  }
  if (reader.size > config.maxTiffBytes) {
    throw new TiffDecodeError(
      'too_large',
      `File is ${Math.round(reader.size / 1024 / 1024)} MB; the on-device limit is ${Math.round(
        config.maxTiffBytes / 1024 / 1024,
      )} MB.`,
    );
  }

  const header = await reader.readView(0, 8);
  const byteOrder = header.getUint16(0, false);

  let littleEndian: boolean;
  if (byteOrder === 0x4949) littleEndian = true;
  else if (byteOrder === 0x4d4d) littleEndian = false;
  else {
    throw new TiffDecodeError(
      'not_tiff',
      'File does not start with a TIFF byte-order marker (II or MM).',
    );
  }

  const magic = header.getUint16(2, littleEndian);
  if (magic === 43) {
    throw new TiffDecodeError(
      'bigtiff',
      'BigTIFF (64-bit) files are not supported on device. Upload for server-side analysis instead.',
    );
  }
  if (magic !== 42) {
    throw new TiffDecodeError('not_tiff', `Unexpected TIFF magic number ${magic} (expected 42).`);
  }

  const ifdOffset = header.getUint32(4, littleEndian);
  const entries = await parseIfd(reader, ifdOffset, littleEndian);

  const width = requireTag(entries, TAG.IMAGE_WIDTH, 'ImageWidth').values[0];
  const height = requireTag(entries, TAG.IMAGE_LENGTH, 'ImageLength').values[0];
  const samplesPerPixel = entries.get(TAG.SAMPLES_PER_PIXEL)?.values[0] ?? 1;
  const bitsPerSampleValues = entries.get(TAG.BITS_PER_SAMPLE)?.values ?? [8];
  const bitsPerSample = bitsPerSampleValues[0];
  const compression = entries.get(TAG.COMPRESSION)?.values[0] ?? 1;
  const planarConfig = entries.get(TAG.PLANAR_CONFIG)?.values[0] ?? 1;
  const sampleFormatCode = entries.get(TAG.SAMPLE_FORMAT)?.values[0] ?? 1;
  const rowsPerStrip = entries.get(TAG.ROWS_PER_STRIP)?.values[0] ?? height;

  if (compression !== 1) {
    throw new TiffDecodeError(
      'unsupported_compression',
      `This TIFF uses ${
        COMPRESSION_NAMES[compression] ?? `compression code ${compression}`
      } compression. On-device preview needs an uncompressed TIFF; the file will still be analysed server-side.`,
    );
  }

  if (!bitsPerSampleValues.every((bits) => bits === bitsPerSample)) {
    throw new TiffDecodeError(
      'mixed_bit_depth',
      'Bands with differing bit depths are not supported.',
    );
  }

  if (![8, 16, 32].includes(bitsPerSample)) {
    throw new TiffDecodeError(
      'unsupported_bit_depth',
      `${bitsPerSample}-bit samples are not supported (expected 8, 16, or 32).`,
    );
  }

  if (bitsPerSample === 32 && sampleFormatCode !== 3) {
    throw new TiffDecodeError(
      'unsupported_sample_format',
      '32-bit integer samples are not supported; only 32-bit float.',
    );
  }

  const stripOffsets = requireTag(entries, TAG.STRIP_OFFSETS, 'StripOffsets').values;
  const stripByteCounts = requireTag(entries, TAG.STRIP_BYTE_COUNTS, 'StripByteCounts').values;

  if (stripOffsets.length !== stripByteCounts.length) {
    throw new TiffDecodeError(
      'strip_mismatch',
      'StripOffsets and StripByteCounts have different lengths.',
    );
  }

  return {
    width,
    height,
    bandCount: samplesPerPixel,
    bitsPerSample,
    sampleFormat: sampleFormatCode === 3 ? 'float' : sampleFormatCode === 2 ? 'int' : 'uint',
    compression,
    planarConfig,
    littleEndian,
    byteLength: reader.size,
    rowsPerStrip,
    stripOffsets,
    stripByteCounts,
    bytesPerSample: bitsPerSample / 8,
  };
}

/* --------------------------------------------------------- decimation */

export interface Decimation {
  stride: number;
  outWidth: number;
  outHeight: number;
}

/**
 * Pick an integer row/column stride so the decoded raster fits both the texture
 * edge limit and the per-band sample budget. Integer striding (rather than a
 * filtered resample) is intentional: it is a pure read-skip, so cost scales
 * down with the stride instead of staying proportional to the source size.
 */
export function chooseDecimation(width: number, height: number, bandCount: number): Decimation {
  const budget = Math.max(1, Math.floor(MAX_SAMPLES_PER_BAND / Math.max(1, Math.min(bandCount, MAX_PACKED_BANDS))));
  let stride = 1;

  for (;;) {
    const outWidth = Math.ceil(width / stride);
    const outHeight = Math.ceil(height / stride);
    const withinEdge = Math.max(outWidth, outHeight) <= config.maxTextureEdge;
    const withinBudget = outWidth * outHeight <= budget;
    if ((withinEdge && withinBudget) || stride >= 64) {
      return { stride, outWidth, outHeight };
    }
    stride += 1;
  }
}

/* ------------------------------------------------------------- decoding */

interface BandAccumulator {
  /** Decimated raw values, row-major, outWidth * outHeight. */
  samples: Float32Array;
  histogram: Uint32Array;
  min: number;
  max: number;
}

function sampleAt(
  view: DataView,
  byteOffset: number,
  bitsPerSample: number,
  isFloat: boolean,
  littleEndian: boolean,
): number {
  if (bitsPerSample === 8) return view.getUint8(byteOffset);
  if (bitsPerSample === 16) return view.getUint16(byteOffset, littleEndian);
  if (isFloat) return view.getFloat32(byteOffset, littleEndian);
  return view.getUint32(byteOffset, littleEndian);
}

function percentileFromHistogram(
  histogram: Uint32Array,
  total: number,
  min: number,
  max: number,
  fraction: number,
): number {
  if (total === 0 || max <= min) return min;
  const target = total * fraction;
  let cumulative = 0;
  for (let bin = 0; bin < histogram.length; bin += 1) {
    cumulative += histogram[bin];
    if (cumulative >= target) {
      return min + ((bin + 0.5) / histogram.length) * (max - min);
    }
  }
  return max;
}

/**
 * Decode and pack a TIFF into GPU-ready textures.
 *
 * Two textures, not one
 * ---------------------
 * Bands go into the R/G/B channels of opaque textures with alpha pinned to 255.
 * Using alpha as a fourth data channel looks tempting but Skia premultiplies on
 * sample, which would silently scale the other three channels by the band value
 * stored in alpha — corrupting exactly the radiometry we are trying to preserve.
 * Two opaque RGB textures sidestep that entirely and still cover six bands.
 *
 * @param uriOrPath local file path (not a content:// uri — materialise first)
 * @param onProgress 0..1 progress callback for the UI
 */
export async function decodeTiffToTextures(
  uriOrPath: string,
  onProgress?: (fraction: number) => void,
): Promise<PackedBands> {
  const startedAt = Date.now();
  const reader = await NativeFileReader.open(uriOrPath);

  try {
    const layout = await readTiffLayout(reader);
    const {
      width,
      height,
      bandCount,
      bitsPerSample,
      bytesPerSample,
      littleEndian,
      planarConfig,
      rowsPerStrip,
      stripOffsets,
      stripByteCounts,
      sampleFormat,
    } = layout;

    const isFloat = sampleFormat === 'float';
    const usableBands = Math.min(bandCount, MAX_PACKED_BANDS);
    const { stride, outWidth, outHeight } = chooseDecimation(width, height, bandCount);

    const accumulators: BandAccumulator[] = Array.from({ length: usableBands }, () => ({
      samples: new Float32Array(outWidth * outHeight),
      histogram: new Uint32Array(HISTOGRAM_BINS),
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    }));

    const stripsPerBand = Math.ceil(height / rowsPerStrip);
    const totalStrips = stripOffsets.length;

    /**
     * Pass 1 — stream every strip once, writing decimated raw values into the
     * accumulators and tracking min/max. Only rows on the stride grid are read.
     */
    for (let stripIndex = 0; stripIndex < totalStrips; stripIndex += 1) {
      const bandForStrip = planarConfig === 2 ? Math.floor(stripIndex / stripsPerBand) : -1;

      // Planar file with more bands than we can pack: skip the extra planes.
      if (planarConfig === 2 && bandForStrip >= usableBands) continue;

      const stripRowStart =
        planarConfig === 2 ? (stripIndex % stripsPerBand) * rowsPerStrip : stripIndex * rowsPerStrip;
      const stripRowCount = Math.min(rowsPerStrip, height - stripRowStart);
      if (stripRowCount <= 0) continue;

      const samplesPerRow = planarConfig === 2 ? width : width * bandCount;
      const rowBytes = samplesPerRow * bytesPerSample;

      // Nothing on the stride grid lands in this strip — skip the read entirely.
      const firstGridRow = Math.ceil(stripRowStart / stride) * stride;
      if (firstGridRow >= stripRowStart + stripRowCount) {
        onProgress?.((stripIndex + 1) / totalStrips);
        continue;
      }

      const stripBytes = Math.min(
        stripByteCounts[stripIndex],
        reader.size - stripOffsets[stripIndex],
      );
      const raw = await reader.readRange(stripOffsets[stripIndex], stripBytes);
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

      for (let row = firstGridRow; row < stripRowStart + stripRowCount; row += stride) {
        const localRow = row - stripRowStart;
        const rowStart = localRow * rowBytes;
        if (rowStart + rowBytes > raw.byteLength) break;

        const outRow = Math.floor(row / stride);
        if (outRow >= outHeight) break;
        const outRowOffset = outRow * outWidth;

        for (let column = 0, outColumn = 0; column < width && outColumn < outWidth; column += stride, outColumn += 1) {
          if (planarConfig === 2) {
            const accumulator = accumulators[bandForStrip];
            const value = sampleAt(
              view,
              rowStart + column * bytesPerSample,
              bitsPerSample,
              isFloat,
              littleEndian,
            );
            accumulator.samples[outRowOffset + outColumn] = value;
            if (value < accumulator.min) accumulator.min = value;
            if (value > accumulator.max) accumulator.max = value;
          } else {
            const pixelOffset = rowStart + column * bandCount * bytesPerSample;
            for (let band = 0; band < usableBands; band += 1) {
              const accumulator = accumulators[band];
              const value = sampleAt(
                view,
                pixelOffset + band * bytesPerSample,
                bitsPerSample,
                isFloat,
                littleEndian,
              );
              accumulator.samples[outRowOffset + outColumn] = value;
              if (value < accumulator.min) accumulator.min = value;
              if (value > accumulator.max) accumulator.max = value;
            }
          }
        }
      }

      onProgress?.(((stripIndex + 1) / totalStrips) * 0.8);
    }

    /**
     * Pass 2 — build histograms over the (already small) decimated arrays and
     * derive percentile clip bounds. Raw reflectance occupies a narrow slice of
     * the sensor's range, so a min..max stretch renders almost black; the 2/98
     * clip is what makes the composite legible.
     */
    const stretches: BandStretch[] = [];
    for (let band = 0; band < usableBands; band += 1) {
      const accumulator = accumulators[band];
      if (!Number.isFinite(accumulator.min) || !Number.isFinite(accumulator.max)) {
        accumulator.min = 0;
        accumulator.max = 1;
      }
      const range = accumulator.max - accumulator.min || 1;

      for (let i = 0; i < accumulator.samples.length; i += 1) {
        const bin = Math.min(
          HISTOGRAM_BINS - 1,
          Math.floor(((accumulator.samples[i] - accumulator.min) / range) * HISTOGRAM_BINS),
        );
        accumulator.histogram[bin] += 1;
      }

      const total = accumulator.samples.length;
      const lowRaw = percentileFromHistogram(
        accumulator.histogram,
        total,
        accumulator.min,
        accumulator.max,
        config.stretchPercentiles.low,
      );
      const highRaw = percentileFromHistogram(
        accumulator.histogram,
        total,
        accumulator.min,
        accumulator.max,
        config.stretchPercentiles.high,
      );

      // Textures are 8-bit, so the stretch bounds are expressed in the same
      // 0..1 space the shader samples in.
      const lo = (lowRaw - accumulator.min) / range;
      const hi = (highRaw - accumulator.min) / range;
      stretches.push({ lo, hi: Math.max(hi, lo + 1e-3) });
    }

    /** Pass 3 — quantise into RGBA8 textures. */
    const pixelCount = outWidth * outHeight;
    const textureA = new Uint8Array(pixelCount * 4);
    const needsTextureB = usableBands > 3;
    const textureB = needsTextureB ? new Uint8Array(pixelCount * 4) : null;

    for (let band = 0; band < usableBands; band += 1) {
      const accumulator = accumulators[band];
      const range = accumulator.max - accumulator.min || 1;
      const target = band < 3 ? textureA : textureB!;
      const channel = band % 3;

      for (let i = 0; i < pixelCount; i += 1) {
        const normalised = (accumulator.samples[i] - accumulator.min) / range;
        target[i * 4 + channel] = Math.max(0, Math.min(255, Math.round(normalised * 255)));
      }
    }

    // Opaque alpha on both textures — see the note above about premultiply.
    for (let i = 0; i < pixelCount; i += 1) {
      textureA[i * 4 + 3] = 255;
      if (textureB) textureB[i * 4 + 3] = 255;
    }

    onProgress?.(1);

    return {
      metadata: {
        width,
        height,
        bandCount,
        bitsPerSample,
        sampleFormat,
        compression: layout.compression,
        planarConfig,
        littleEndian,
        byteLength: layout.byteLength,
      },
      textureA,
      textureB,
      width: outWidth,
      height: outHeight,
      stretches,
      decodeMs: Date.now() - startedAt,
    };
  } finally {
    await reader.close();
  }
}

/** Probe the header only — cheap enough to run before committing to a decode. */
export async function inspectTiff(uriOrPath: string): Promise<TiffMetadata> {
  const reader = await NativeFileReader.open(uriOrPath);
  try {
    const layout = await readTiffLayout(reader);
    return {
      width: layout.width,
      height: layout.height,
      bandCount: layout.bandCount,
      bitsPerSample: layout.bitsPerSample,
      sampleFormat: layout.sampleFormat,
      compression: layout.compression,
      planarConfig: layout.planarConfig,
      littleEndian: layout.littleEndian,
      byteLength: layout.byteLength,
    };
  } finally {
    await reader.close();
  }
}
