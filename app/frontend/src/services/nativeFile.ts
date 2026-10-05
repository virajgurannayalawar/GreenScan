import ReactNativeBlobUtil from 'react-native-blob-util';
import base64 from 'base64-js';
import config from '../config/env';

/**
 * Native-backed random-access reader for large on-device files.
 *
 * Why this exists
 * ---------------
 * The naive approach is `fs.readFile(path, 'base64')`, which materialises the
 * entire file as one JavaScript string — a 60 MB TIFF becomes an 80 MB string
 * that has to cross the bridge in a single blocking hop, then a second
 * allocation to decode it. On a mid-range Android device that is a multi-second
 * freeze and a very plausible OOM.
 *
 * Instead we use `fs.slice`, which performs the byte-range copy entirely in
 * native code, and only ever pull ~1 MB across the bridge at a time. The TIFF
 * header parse touches a few kilobytes; the pixel pass streams sequentially
 * through fixed-size windows. Peak JS heap stays flat regardless of file size.
 */

const SCRATCH_PREFIX = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/pestiscan-slice`;

export interface FileHandleInfo {
  path: string;
  size: number;
}

/** Strip the `file://` scheme that pickers add; native fs wants a bare path. */
export function normalisePath(uriOrPath: string): string {
  if (uriOrPath.startsWith('file://')) {
    return decodeURIComponent(uriOrPath.replace('file://', ''));
  }
  return uriOrPath;
}

export async function statFile(uriOrPath: string): Promise<FileHandleInfo> {
  const path = normalisePath(uriOrPath);
  const stat = await ReactNativeBlobUtil.fs.stat(path);
  return { path, size: Number(stat.size) };
}

/**
 * Copy a content:// or file:// uri into the app cache and return a bare path.
 * Android's document provider hands back content uris that native fs calls
 * cannot seek into, so a local copy is mandatory before any slicing.
 */
export async function materialiseToCache(uri: string, filename: string): Promise<FileHandleInfo> {
  const safeName = filename.replace(/[^\w.\-]/g, '_');
  const destination = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/pestiscan-${Date.now()}-${safeName}`;

  if (uri.startsWith('content://')) {
    await ReactNativeBlobUtil.fs.cp(uri, destination);
  } else {
    const source = normalisePath(uri);
    if (source === destination) return statFile(destination);
    await ReactNativeBlobUtil.fs.cp(source, destination);
  }

  return statFile(destination);
}

export class NativeFileReader {
  readonly path: string;

  readonly size: number;

  private window: Uint8Array = new Uint8Array(0);

  private windowStart = 0;

  private readonly scratchPath: string;

  private sliceCount = 0;

  private bytesPulled = 0;

  constructor(info: FileHandleInfo) {
    this.path = info.path;
    this.size = info.size;
    this.scratchPath = `${SCRATCH_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  static async open(uriOrPath: string): Promise<NativeFileReader> {
    return new NativeFileReader(await statFile(uriOrPath));
  }

  /** Diagnostics surfaced in the debug panel. */
  get stats(): { sliceCount: number; bytesPulled: number } {
    return { sliceCount: this.sliceCount, bytesPulled: this.bytesPulled };
  }

  private async loadWindow(offset: number, minLength: number): Promise<void> {
    const windowLength = Math.min(
      this.size - offset,
      Math.max(config.readChunkBytes, minLength),
    );

    // fs.slice does the copy natively; nothing of this range touches JS yet.
    await ReactNativeBlobUtil.fs.slice(
      this.path,
      this.scratchPath,
      offset,
      offset + windowLength,
    );

    const encoded = await ReactNativeBlobUtil.fs.readFile(this.scratchPath, 'base64');
    this.window = base64.toByteArray(encoded);
    this.windowStart = offset;

    this.sliceCount += 1;
    this.bytesPulled += this.window.byteLength;
  }

  /**
   * Read `length` bytes at `offset`. Returns a copy so callers may retain it
   * across subsequent reads without aliasing the sliding window.
   */
  async readRange(offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || length < 0) {
      throw new Error(`Invalid read range: offset=${offset} length=${length}`);
    }
    if (offset + length > this.size) {
      throw new Error(
        `Read past end of file: wanted ${offset}+${length}, file is ${this.size} bytes`,
      );
    }
    if (length === 0) return new Uint8Array(0);

    const inWindow =
      offset >= this.windowStart && offset + length <= this.windowStart + this.window.byteLength;

    if (!inWindow) {
      await this.loadWindow(offset, length);
    }

    const start = offset - this.windowStart;
    return this.window.slice(start, start + length);
  }

  /** Convenience wrapper that hands back a DataView over the requested range. */
  async readView(offset: number, length: number): Promise<DataView> {
    const bytes = await this.readRange(offset, length);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  async close(): Promise<void> {
    this.window = new Uint8Array(0);
    try {
      if (await ReactNativeBlobUtil.fs.exists(this.scratchPath)) {
        await ReactNativeBlobUtil.fs.unlink(this.scratchPath);
      }
    } catch {
      // Cache cleanup is best-effort; the OS reclaims CacheDir anyway.
    }
  }
}

/** Remove any cache files this module created in earlier sessions. */
export async function purgeCache(): Promise<void> {
  try {
    const dir = ReactNativeBlobUtil.fs.dirs.CacheDir;
    const entries = await ReactNativeBlobUtil.fs.ls(dir);
    await Promise.all(
      entries
        .filter((name) => name.startsWith('pestiscan-'))
        .map((name) => ReactNativeBlobUtil.fs.unlink(`${dir}/${name}`).catch(() => undefined)),
    );
  } catch {
    // Non-fatal.
  }
}
