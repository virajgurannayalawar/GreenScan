import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Banner, Button, KeyValue } from './ui';
import type { CameraProbeReport } from '../types';

/**
 * Shown when `Camera.getAvailableCameraDevices()` reports no multispectral
 * sensor — i.e. on every phone currently on the market. It explains *why* the
 * fallback appeared (with the actual device list, not a vague apology) and
 * collects a .tif instead.
 */
export function TiffUploadWidget({
  report,
  onPickFile,
  onCancel,
  busy,
}: {
  report: CameraProbeReport | null;
  onPickFile: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const denied = report?.capability === 'denied';

  const title =
    report?.capability === 'denied'
      ? 'Camera access denied'
      : report?.capability === 'multispectral'
        ? 'Multispectral sensor detected'
        : report?.capability === 'unavailable'
          ? 'No camera available'
          : 'No multispectral sensor on this device';

  return (
    <View style={styles.container}>
      <Banner
        tone={denied ? 'warning' : report?.capability === 'multispectral' ? 'success' : 'info'}
        title={title}
        message={
          report?.capability === 'multispectral'
            ? `${report.reason} Live capture is not wired up yet, so upload an exported .tif for now.`
            : (report?.reason ?? 'Checking the camera hardware…')
        }
        action={
          denied ? (
            <Button label="Open Settings" variant="ghost" onPress={() => Linking.openSettings()} />
          ) : undefined
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose a TIFF file"
        onPress={onPickFile}
        disabled={busy}
        style={({ pressed }) => [styles.dropzone, pressed && styles.dropzonePressed, busy && styles.dropzoneBusy]}
      >
        <View style={styles.iconStack}>
          <View style={[styles.layer, styles.layerBack]} />
          <View style={[styles.layer, styles.layerMid]} />
          <View style={[styles.layer, styles.layerFront]}>
            <Text style={styles.layerLabel}>TIF</Text>
          </View>
        </View>

        <Text style={styles.dropTitle}>Upload a multispectral .tif</Text>
        <Text style={styles.dropBody}>
          Select the file exported from your multispectral camera. Tap to open the file browser.
        </Text>
      </Pressable>

      

      {report?.inspected.length ? (
        <View style={styles.devices}>
          <Text style={styles.requirementsTitle}>Cameras reported by this device</Text>
          {report.inspected.map((device) => (
            <KeyValue
              key={device.id}
              label={device.position}
              value={
                device.physicalDevices.length ? device.physicalDevices.join(', ') : device.name
              }
              mono
            />
          ))}
        </View>
      ) : null}

      <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },

  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: `${colors.primary}88`,
    backgroundColor: `${colors.primary}0D`,
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  dropzonePressed: { backgroundColor: `${colors.primary}1A`, borderColor: colors.primary },
  dropzoneBusy: { opacity: 0.5 },

  iconStack: { width: 72, height: 64, marginBottom: spacing.sm },
  layer: {
    position: 'absolute',
    width: 46,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  layerBack: {
    left: 0,
    top: 0,
    borderColor: `${colors.info}66`,
    backgroundColor: `${colors.info}22`,
  },
  layerMid: {
    left: 11,
    top: 4,
    borderColor: `${colors.warning}66`,
    backgroundColor: `${colors.warning}22`,
  },
  layerFront: {
    left: 22,
    top: 8,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerLabel: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  dropTitle: { ...typography.subtitle, color: colors.text },
  dropBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },

  requirements: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
  requirementsTitle: {
    ...typography.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  requirementsNote: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: spacing.md,
    lineHeight: 17,
  },

  devices: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
});

export default TiffUploadWidget;
