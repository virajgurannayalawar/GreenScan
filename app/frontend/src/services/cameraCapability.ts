import { Camera, type CameraDevice } from 'react-native-vision-camera';
import type { CameraProbeReport } from '../types';

/**
 * Decide whether this handset can capture multispectral imagery directly.
 *
 * The honest answer on every consumer phone is "no". Vision Camera's
 * `PhysicalCameraDeviceType` union is exactly three values —
 * `ultra-wide-angle-camera`, `wide-angle-camera`, `telephoto-camera` — all of
 * which are Bayer RGB sensors behind an IR-cut filter. There is no multispectral
 * member, because the platform camera APIs have no concept of one.
 *
 * So this probe is written as an extension point rather than a guess: it
 * inspects every reported device for a multispectral marker (which an OEM build
 * or an attached sensor module would expose through the device name or physical
 * device list) and, finding none, returns `rgb-only`. That is the signal the
 * Scan screen uses to fall back to the .tif upload path.
 *
 * When a genuine multispectral device does appear, add its marker to
 * MULTISPECTRAL_MARKERS and the live-capture branch lights up without any other
 * change.
 */

const MULTISPECTRAL_MARKERS = [
  'multispectral',
  'multi-spectral',
  'hyperspectral',
  'spectral',
  'nir',
  'near-infrared',
  'infrared',
];

function hasMultispectralMarker(device: CameraDevice): boolean {
  const haystack = [device.name, device.id, ...(device.physicalDevices ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return MULTISPECTRAL_MARKERS.some((marker) => haystack.includes(marker));
}

function summarise(device: CameraDevice) {
  return {
    id: device.id,
    name: device.name ?? 'unnamed',
    position: device.position ?? 'unknown',
    physicalDevices: [...(device.physicalDevices ?? [])],
  };
}

export async function ensureCameraPermission(): Promise<'granted' | 'denied'> {
  const current = Camera.getCameraPermissionStatus();
  if (current === 'granted') return 'granted';

  const requested = await Camera.requestCameraPermission();
  return requested === 'granted' ? 'granted' : 'denied';
}

/**
 * Probe the hardware. Permission is requested first because on both platforms
 * the device list is incomplete (or empty) before the user has granted access,
 * and an empty list would be misread as "no camera".
 */
export async function probeCameraCapability(): Promise<CameraProbeReport> {
  let permission: 'granted' | 'denied';
  try {
    permission = await ensureCameraPermission();
  } catch (error) {
    return {
      capability: 'unavailable',
      deviceCount: 0,
      inspected: [],
      reason: `Camera permission check failed: ${(error as Error).message}`,
    };
  }

  if (permission === 'denied') {
    return {
      capability: 'denied',
      deviceCount: 0,
      inspected: [],
      reason:
        'Camera access was denied, so the sensor cannot be identified. Upload a .tif file instead, or grant camera access in Settings.',
    };
  }

  let devices: CameraDevice[] = [];
  try {
    devices = Camera.getAvailableCameraDevices();
  } catch (error) {
    return {
      capability: 'unavailable',
      deviceCount: 0,
      inspected: [],
      reason: `Could not enumerate camera devices: ${(error as Error).message}`,
    };
  }

  const inspected = devices.map(summarise);

  if (devices.length === 0) {
    return {
      capability: 'unavailable',
      deviceCount: 0,
      inspected,
      reason: 'No camera devices were reported by the operating system.',
    };
  }

  const multispectral = devices.find(hasMultispectralMarker);

  if (multispectral) {
    return {
      capability: 'multispectral',
      deviceCount: devices.length,
      inspected,
      reason: `Multispectral-capable device detected: ${multispectral.name ?? multispectral.id}.`,
    };
  }

  const types = Array.from(new Set(inspected.flatMap((device) => device.physicalDevices)));

  return {
    capability: 'rgb-only',
    deviceCount: devices.length,
    inspected,
    reason: `This device reports ${devices.length} RGB camera${
      devices.length === 1 ? '' : 's'
    }${types.length ? ` (${types.join(', ')})` : ''} and no multispectral sensor, so live capture is unavailable.`,
  };
}

/** True when live multispectral capture is possible. */
export function supportsLiveCapture(report: CameraProbeReport | null): boolean {
  return report?.capability === 'multispectral';
}
