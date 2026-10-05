import ReactNativeBlobUtil from 'react-native-blob-util';
import config, { apiUrl } from '../config/env';
import { getDeviceId } from './deviceIdentity';
import type {
  BandMapping,
  HistoryPage,
  HistorySummary,
  PickedTiff,
  Profile,
  ScanResult,
} from '../types';

export class ApiError extends Error {
  readonly statusCode: number;

  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function describeNetworkFailure(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : String(error);
  return new ApiError(
    0,
    'network_error',
    `Could not reach the PestiScan API at ${config.apiBaseUrl}. ${message}`,
  );
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const deviceId = await getDeviceId();
  const { method = 'GET', body, query } = options;

  const search = query
    ? Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
        .join('&')
    : '';

  const url = `${apiUrl(path)}${search ? `?${search}` : ''}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'x-device-id': deviceId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    throw describeNetworkFailure(error);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(response.status, 'bad_response', `Unexpected response body: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const errorBody = payload as { code?: string; message?: string };
    throw new ApiError(
      response.status,
      errorBody.code ?? 'error',
      errorBody.message ?? `Request failed with status ${response.status}.`,
    );
  }

  return payload as T;
}

/* --------------------------------------------------------------- uploads */

export interface UploadOptions {
  file: PickedTiff;
  clientScanId: string;
  bandMapping?: BandMapping;
  onProgress?: (fraction: number, written: number, total: number) => void;
}

/**
 * Work-II: stream the .tif to the backend.
 *
 * `ReactNativeBlobUtil.fetch` with `wrap(path)` streams the file straight off
 * disk in native code. The alternative — a JS `FormData` with a base64 payload
 * — would load the whole multispectral file into the JS heap and block the
 * bridge for the duration of the upload, freezing the very canvas the user is
 * panning around in Work-I.
 */
export async function uploadScan(options: UploadOptions): Promise<ScanResult> {
  const { file, clientScanId, bandMapping, onProgress } = options;
  const deviceId = await getDeviceId();

  const metadata = JSON.stringify({
    deviceId,
    clientScanId,
    capturedAt: new Date().toISOString(),
    bandMapping: bandMapping
      ? { red: bandMapping.red, green: bandMapping.green, blue: bandMapping.blue }
      : undefined,
  });

  const task = ReactNativeBlobUtil.config({
    timeout: config.uploadTimeoutMs,
  }).fetch(
    'POST',
    apiUrl('/scans'),
    {
      'Content-Type': 'multipart/form-data',
      Accept: 'application/json',
      'x-device-id': deviceId,
    },
    [
      {
        name: 'file',
        filename: file.name,
        type: file.mimeType ?? 'image/tiff',
        data: ReactNativeBlobUtil.wrap(file.path),
      },
      { name: 'deviceId', data: deviceId },
      { name: 'clientScanId', data: clientScanId },
      { name: 'metadata', data: metadata },
    ],
  );

  if (onProgress) {
    task.uploadProgress({ interval: 250 }, (written, total) => {
      const numericWritten = Number(written);
      const numericTotal = Number(total) || file.size;
      onProgress(numericTotal > 0 ? numericWritten / numericTotal : 0, numericWritten, numericTotal);
    });
  }

  let response;
  try {
    response = await task;
  } catch (error) {
    throw describeNetworkFailure(error);
  }

  const status = response.info().status;
  const text = await response.text();

  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(status, 'bad_response', `Unexpected upload response: ${text.slice(0, 200)}`);
  }

  if (status < 200 || status >= 300) {
    const errorBody = payload as { code?: string; message?: string };
    throw new ApiError(
      status,
      errorBody.code ?? 'upload_failed',
      errorBody.message ?? `Upload failed with status ${status}.`,
    );
  }

  return payload as ScanResult;
}

/* ------------------------------------------------------------- endpoints */

export const api = {
  health: () => request<Record<string, unknown>>('/health'),

  getScan: (id: string) => request<ScanResult>(`/scans/${id}`),

  deleteScan: (id: string) => request<void>(`/scans/${id}`, { method: 'DELETE' }),

  getHistory: (params: { cursor?: string; limit?: number; status?: string } = {}) =>
    request<HistoryPage>('/history', {
      query: {
        cursor: params.cursor,
        limit: params.limit ? String(params.limit) : undefined,
        status: params.status,
      },
    }),

  getHistorySummary: () => request<HistorySummary>('/history/summary'),

  getProfile: () => request<Profile>('/profile'),

  updateProfile: (patch: Partial<Profile> & { preferences?: Partial<Profile['preferences']> }) =>
    request<Profile>('/profile', { method: 'PATCH', body: patch }),
};

export default api;
