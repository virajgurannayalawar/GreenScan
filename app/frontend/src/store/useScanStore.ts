import { create } from 'zustand';
import config from '../config/env';
import { probeCameraCapability } from '../services/cameraCapability';
import { PickerCancelled, pickTiffFile } from '../services/documentPicker';
import { decodeTiffToTextures, TiffDecodeError } from '../services/tiffDecoder';
import { createBandTextures, type BandTextures } from '../services/skiaTexture';
import { newClientScanId } from '../services/deviceIdentity';
import { uploadScan } from '../services/api';
import type {
  BandMapping,
  CameraProbeReport,
  PackedBands,
  PickedTiff,
  RenderMode,
  ScanError,
  ScanPhase,
  ScanResult,
} from '../types';
import { useHistoryStore } from './useHistoryStore';

interface ScanState {
  phase: ScanPhase;
  cameraReport: CameraProbeReport | null;

  file: PickedTiff | null;

  /* ---- Work-I: local render ---- */
  packed: PackedBands | null;
  textures: BandTextures | null;
  decodeProgress: number;
  decodeError: ScanError | null;

  /* ---- Work-II: backend analysis ---- */
  uploadProgress: number;
  uploading: boolean;
  result: ScanResult | null;
  uploadError: ScanError | null;

  /* ---- viewer controls ---- */
  mapping: BandMapping;
  renderMode: RenderMode;
  gain: number;
  gamma: number;

  /* ---- actions ---- */
  startScan: () => Promise<void>;
  chooseFile: () => Promise<void>;
  processFile: (file: PickedTiff) => Promise<void>;
  retryUpload: () => Promise<void>;
  setMapping: (mapping: Partial<BandMapping>) => void;
  setRenderMode: (mode: RenderMode) => void;
  setGain: (gain: number) => void;
  setGamma: (gamma: number) => void;
  reset: () => void;
}

const initialViewerState = {
  mapping: { ...config.defaultBandMapping } as BandMapping,
  renderMode: 'false-color' as RenderMode,
  gain: 1.05,
  gamma: 1.1,
};

function toScanError(stage: ScanError['stage'], error: unknown): ScanError {
  if (error instanceof TiffDecodeError) {
    return { stage, message: error.message, detail: error.code };
  }
  if (error instanceof Error) {
    return { stage, message: error.message, detail: error.name };
  }
  return { stage, message: String(error) };
}

export const useScanStore = create<ScanState>((set, get) => ({
  phase: 'idle',
  cameraReport: null,

  file: null,

  packed: null,
  textures: null,
  decodeProgress: 0,
  decodeError: null,

  uploadProgress: 0,
  uploading: false,
  result: null,
  uploadError: null,

  ...initialViewerState,

  /**
   * The green button. Probes the sensor first; a multispectral device would go
   * straight to live capture, anything else falls through to the .tif upload
   * widget — which is the real path on every phone that exists today.
   */
  startScan: async () => {
    set({
      phase: 'probing-camera',
      decodeError: null,
      uploadError: null,
      result: null,
      packed: null,
      textures: null,
      file: null,
      decodeProgress: 0,
      uploadProgress: 0,
    });

    const report = await probeCameraCapability();

    set({
      cameraReport: report,
      // Live multispectral capture is not implemented because no shipping
      // handset exposes such a device; the branch exists so the flow is
      // correct the day one does. Everything else needs a file.
      phase: 'awaiting-file',
    });
  },

  chooseFile: async () => {
    try {
      const file = await pickTiffFile();
      await get().processFile(file);
    } catch (error) {
      if (error instanceof PickerCancelled) {
        // Returning to the widget is the right outcome, not an error state.
        set({ phase: 'awaiting-file' });
        return;
      }
      set({ phase: 'error', decodeError: toScanError('picker', error) });
    }
  },

  /**
   * Work-I and Work-II start together and are independent.
   *
   * The local GPU render is what the user is waiting to look at, and the upload
   * is a network round trip that includes server-side decode plus two ONNX
   * passes. Serialising them would make the user stare at a spinner for the sum
   * of both. `allSettled` also means a decode failure (e.g. an LZW-compressed
   * TIFF the on-device decoder rejects) still returns a usable server result,
   * and a dead network still shows the picture.
   */
  processFile: async (file: PickedTiff) => {
    const clientScanId = newClientScanId();
    const { mapping } = get();

    set({
      file,
      phase: 'decoding',
      decodeProgress: 0,
      uploadProgress: 0,
      uploading: true,
      decodeError: null,
      uploadError: null,
      result: null,
    });

    const decodeTask = (async () => {
      const packed = await decodeTiffToTextures(file.path, (fraction) =>
        set({ decodeProgress: fraction }),
      );
      const textures = createBandTextures(packed);
      set({ packed, textures, decodeProgress: 1 });
    })();

    const uploadTask = (async () => {
      const result = await uploadScan({
        file,
        clientScanId,
        bandMapping: mapping,
        onProgress: (fraction) => set({ uploadProgress: fraction }),
      });
      set({ result, uploadProgress: 1 });
      // History is now stale.
      useHistoryStore.getState().invalidate();
    })();

    const [decodeOutcome, uploadOutcome] = await Promise.allSettled([decodeTask, uploadTask]);

    const decodeError =
      decodeOutcome.status === 'rejected' ? toScanError('decode', decodeOutcome.reason) : null;
    const uploadError =
      uploadOutcome.status === 'rejected' ? toScanError('upload', uploadOutcome.reason) : null;

    set({
      uploading: false,
      decodeError,
      uploadError,
      // Only a total failure is a dead end; one surviving half is still useful.
      phase: decodeError && uploadError ? 'error' : 'ready',
    });
  },

  retryUpload: async () => {
    const { file, mapping } = get();
    if (!file) return;

    set({ uploading: true, uploadError: null, uploadProgress: 0 });

    try {
      const result = await uploadScan({
        file,
        clientScanId: newClientScanId(),
        bandMapping: mapping,
        onProgress: (fraction) => set({ uploadProgress: fraction }),
      });
      set({ result, uploadProgress: 1, phase: 'ready' });
      useHistoryStore.getState().invalidate();
    } catch (error) {
      set({ uploadError: toScanError('upload', error) });
    } finally {
      set({ uploading: false });
    }
  },

  setMapping: (partial) => set((state) => ({ mapping: { ...state.mapping, ...partial } })),
  setRenderMode: (renderMode) => set({ renderMode }),
  setGain: (gain) => set({ gain: Math.max(0.2, Math.min(4, gain)) }),
  setGamma: (gamma) => set({ gamma: Math.max(0.2, Math.min(3, gamma)) }),

  reset: () =>
    set({
      phase: 'idle',
      cameraReport: null,
      file: null,
      packed: null,
      textures: null,
      decodeProgress: 0,
      decodeError: null,
      uploadProgress: 0,
      uploading: false,
      result: null,
      uploadError: null,
      ...initialViewerState,
    }),
}));

export default useScanStore;
