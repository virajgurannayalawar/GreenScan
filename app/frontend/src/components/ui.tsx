import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import theme, { colors, radius, spacing, typography } from '../theme';
import type { ResidueLevel } from '../types';
import { residueLabels } from '../utils/format';

/* ------------------------------------------------------------------ Card */

export function Card({
  title,
  subtitle,
  children,
  style,
  accent,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
}) {
  return (
    <View style={[styles.card, accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : null, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/* -------------------------------------------------------------- KeyValue */

export function KeyValue({
  label,
  value,
  valueColor,
  mono,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text
        style={[styles.kvValue, mono ? styles.kvMono : null, valueColor ? { color: valueColor } : null]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ ProgressBar */

export function ProgressBar({
  progress,
  label,
  color = colors.primary,
}: {
  progress: number;
  label?: string;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={styles.progressWrapper}>
      {label ? (
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{label}</Text>
          <Text style={styles.progressValue}>{Math.round(clamped * 100)}%</Text>
        </View>
      ) : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${clamped * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- Button */

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#06240F' : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' && styles.buttonLabelPrimary,
            variant === 'danger' && styles.buttonLabelDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* ---------------------------------------------------------- SegmentedRow */

export function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------- Stepper */

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, Number(next.toFixed(3))));

  return (
    <View style={styles.stepperRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => onChange(clamp(value - step))}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{format ? format(value) : String(value)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={() => onChange(clamp(value + step))}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ LevelBadge */

export function LevelBadge({ level }: { level: ResidueLevel }) {
  const color = theme.residueColors[level];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeLabel, { color }]}>{residueLabels[level]}</Text>
    </View>
  );
}

/* ---------------------------------------------------------- Banner / Empty */

export function Banner({
  tone = 'info',
  title,
  message,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  const toneColor =
    tone === 'danger'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : tone === 'success'
          ? colors.primary
          : colors.info;

  return (
    <View style={[styles.banner, { borderColor: `${toneColor}66`, backgroundColor: `${toneColor}14` }]}>
      <Text style={[styles.bannerTitle, { color: toneColor }]}>{title}</Text>
      {message ? <Text style={styles.bannerMessage}>{message}</Text> : null}
      {action ? <View style={styles.bannerAction}>{action}</View> : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? <View style={styles.bannerAction}>{action}</View> : null}
    </View>
  );
}

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

/* --------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.subtitle, color: colors.text },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },

  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: 3,
  },
  kvLabel: { ...typography.body, color: colors.textMuted, flexShrink: 0 },
  kvValue: { ...typography.body, color: colors.text, flex: 1, textAlign: 'right', fontWeight: '600' },
  kvMono: { ...typography.mono, color: colors.text },

  progressWrapper: { gap: spacing.xs },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { ...typography.caption, color: colors.textMuted },
  progressValue: { ...typography.caption, color: colors.text },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill },

  button: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  buttonGhost: { backgroundColor: 'transparent', borderColor: colors.border },
  buttonDanger: { backgroundColor: 'transparent', borderColor: `${colors.danger}88` },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...typography.subtitle, color: colors.text },
  buttonLabelPrimary: { color: '#06240F' },
  buttonLabelDanger: { color: colors.danger },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentLabel: { ...typography.caption, color: colors.textMuted },
  segmentLabelActive: { color: '#06240F', fontWeight: '700' },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: { ...typography.subtitle, color: colors.text, lineHeight: 20 },
  stepperValue: { ...typography.body, color: colors.text, minWidth: 68, textAlign: 'center', fontWeight: '600' },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeLabel: { ...typography.caption, fontWeight: '700' },

  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bannerTitle: { ...typography.caption, fontWeight: '700' },
  bannerMessage: { ...typography.body, color: colors.textMuted, lineHeight: 19 },
  bannerAction: { marginTop: spacing.sm },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  emptyMessage: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  sectionHeader: { gap: 2, marginBottom: spacing.sm },
  sectionTitle: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 1 },
  sectionHint: { ...typography.caption, color: colors.textFaint },
});
