import DocumentPicker, {
  isCancel,
  types as DocumentTypes,
  type DocumentPickerResponse,
} from 'react-native-document-picker';
import { Platform } from 'react-native';
import { materialiseToCache } from './nativeFile';
import type { PickedTiff } from '../types';

export class PickerCancelled extends Error {
  constructor() {
    super('File selection cancelled.');
    this.name = 'PickerCancelled';
  }
}

/**
 * Android's document providers are inconsistent about TIFF MIME types — some
 * report `image/tiff`, many report `application/octet-stream`, and a few report
 * nothing at all. Filtering strictly on `image/tiff` makes valid files
 * unselectable (greyed out in the picker), so the type list is deliberately
 * wide and the real validation happens on the extension plus the TIFF magic
 * number in the decoder.
 */
const ANDROID_TYPES = ['image/tiff', 'image/tif', 'application/octet-stream', DocumentTypes.allFiles];
const IOS_TYPES = ['public.tiff', DocumentTypes.allFiles];

function hasTiffExtension(name: string): boolean {
  return /\.tiff?$/i.test(name);
}

/**
 * Open the system picker and return a *local file path*.
 *
 * `copyTo: 'cachesDirectory'` is essential: without it Android hands back a
 * `content://` uri that cannot be seeked into, which breaks the whole streaming
 * decode. The copy is done natively by the picker.
 */
export async function pickTiffFile(): Promise<PickedTiff> {
  let response: DocumentPickerResponse;

  try {
    response = await DocumentPicker.pickSingle({
      type: Platform.OS === 'ios' ? IOS_TYPES : ANDROID_TYPES,
      copyTo: 'cachesDirectory',
      presentationStyle: 'fullScreen',
    });
  } catch (error) {
    if (isCancel(error)) throw new PickerCancelled();
    throw error;
  }

  const name = response.name ?? 'upload.tif';

  if (!hasTiffExtension(name)) {
    throw new Error(
      `"${name}" is not a TIFF. Select a .tif or .tiff file exported from the multispectral sensor.`,
    );
  }

  // Prefer the picker's own cache copy; fall back to copying ourselves.
  const sourceUri = response.fileCopyUri ?? response.uri;
  const handle = await materialiseToCache(sourceUri, name);

  if (handle.size === 0) {
    throw new Error(`"${name}" is empty (0 bytes).`);
  }

  return {
    path: handle.path,
    uri: response.uri,
    name,
    size: handle.size,
    mimeType: response.type ?? null,
  };
}
