import type { ResidueLevel } from '../types';

export const colors = {
  background: '#0B1211',
  surface: '#121D1B',
  surfaceRaised: '#192825',
  border: '#243834',

  /** The primary action green — the Start Scan button. */
  primary: '#22C55E',
  primaryPressed: '#16A34A',
  primaryGlow: 'rgba(34, 197, 94, 0.28)',

  text: '#F1F5F4',
  textMuted: '#9BB0AC',
  textFaint: '#67807B',

  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#38BDF8',

  canvasBackdrop: '#050908',
} as const;

export const residueColors: Record<ResidueLevel, string> = {
  none: '#22C55E',
  low: '#84CC16',
  moderate: '#F59E0B',
  high: '#F97316',
  severe: '#EF4444',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '700' as const },
  subtitle: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  mono: { fontSize: 12, fontWeight: '400' as const, fontFamily: 'Menlo' },
} as const;

export const theme = { colors, residueColors, spacing, radius, typography };
export default theme;
