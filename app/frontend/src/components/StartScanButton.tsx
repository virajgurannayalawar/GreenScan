import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme';

const SIZE = 196;

/**
 * The central green "Start Scan" affordance — the app's only entry point.
 *
 * The idle pulse runs on the Reanimated UI thread, so it keeps ticking at 60 fps
 * even while the JS thread is busy parsing a TIFF header or kicking off an
 * upload. Driving it from `Animated.timing` on the JS thread would stutter at
 * exactly the moment the user is waiting on feedback.
 */
export function StartScanButton({
  onPress,
  busy,
  label = 'Start Scan',
  caption,
}: {
  onPress: () => void;
  busy?: boolean;
  label?: string;
  caption?: string;
}) {
  const pulse = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    if (busy) {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 180 });
      return;
    }

    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );

    return () => cancelAnimation(pulse);
  }, [busy, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />

      <Animated.View style={coreStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
          disabled={busy}
          onPressIn={() => {
            press.value = withTiming(0.95, { duration: 90 });
          }}
          onPressOut={() => {
            press.value = withTiming(1, { duration: 140 });
          }}
          onPress={onPress}
          style={({ pressed }) => [styles.core, pressed && styles.corePressed, busy && styles.coreBusy]}
        >
          {busy ? (
            <ActivityIndicator size="large" color="#06240F" />
          ) : (
            <>
              <View style={styles.reticle}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.label}>{label}</Text>
            </>
          )}
        </Pressable>
      </Animated.View>

      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg },

  halo: {
    position: 'absolute',
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.primaryGlow,
  },

  core: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  corePressed: { backgroundColor: colors.primaryPressed },
  coreBusy: { backgroundColor: colors.primaryPressed },

  reticle: { width: 52, height: 52 },
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: '#06240F',
  },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: radius.sm },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: radius.sm },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderBottomLeftRadius: radius.sm,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomRightRadius: radius.sm,
  },

  label: { ...typography.title, color: '#06240F', letterSpacing: 0.3 },
  caption: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});

export default StartScanButton;
