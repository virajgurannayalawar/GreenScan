import type { ResidueLevel } from '../types';

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatPercent(value?: number, digits = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatDuration(ms?: number): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).valueOf();
  if (Number.isNaN(then)) return '—';
  const deltaSeconds = Math.round((Date.now() - then) / 1000);

  if (deltaSeconds < 60) return 'just now';
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86_400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  if (deltaSeconds < 604_800) return `${Math.floor(deltaSeconds / 86_400)}d ago`;
  return formatDateTime(iso);
}

export const residueLabels: Record<ResidueLevel, string> = {
  none: 'None detected',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
};

/** Human-readable name for a band index under the assumed 5-band layout. */
const BAND_NAMES = ['Blue', 'Green', 'Red', 'NIR', 'Red Edge', 'Band 6'];

export function bandName(index: number): string {
  return BAND_NAMES[index] ?? `Band ${index + 1}`;
}
