import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * Stable per-install identifier.
 *
 * The app has no login screen, so the backend keys profiles and history on this
 * value. It is persisted as a small file in DocumentDir rather than pulling in
 * AsyncStorage — one dependency fewer, and `react-native-blob-util` is already
 * here for the TIFF pipeline.
 *
 * Replace the whole module with your auth subject when real accounts land.
 */

const IDENTITY_PATH = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/pestiscan-device-id`;

let cached: string | null = null;

function generateId(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `dev_${Date.now().toString(36)}_${random()}${random()}`;
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  try {
    if (await ReactNativeBlobUtil.fs.exists(IDENTITY_PATH)) {
      const stored = (await ReactNativeBlobUtil.fs.readFile(IDENTITY_PATH, 'utf8')).trim();
      if (stored) {
        cached = stored;
        return cached;
      }
    }
  } catch {
    // Fall through and mint a new id.
  }

  const fresh = generateId();
  try {
    await ReactNativeBlobUtil.fs.writeFile(IDENTITY_PATH, fresh, 'utf8');
  } catch {
    // Non-fatal: an ephemeral id still works for the current session.
  }

  cached = fresh;
  return fresh;
}

/** Correlation id for one scan attempt, used for upload idempotency. */
export function newClientScanId(): string {
  return `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
