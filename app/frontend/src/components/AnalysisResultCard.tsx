import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { Banner, Button, Card, KeyValue, ProgressBar } from './ui';
import { formatBytes, formatDuration, formatPercent } from '../utils/format';
import type { ScanError, ScanResult } from '../types';

/**
 * Renders the apple dataset classifier result.
 *
 * Residue estimation is disabled; the classifier labels are treatment
 * categories from its training dataset, not residue measurements.
 */
export function AnalysisResultCard({
  result,
  uploading,
  uploadProgress,
  error,
  onRetry,
}: {
  result: ScanResult | null;
  uploading: boolean;
  uploadProgress: number;
  error: ScanError | null;
  onRetry: () => void;
}) {
  if (uploading && !result) {
    return (
      <Card title="Classifying apple image" subtitle="Uploading to the inference service">
        <ProgressBar progress={uploadProgress} label="Upload" />
        <Text style={styles.waitNote}>
          The server checks image quality and classifies supported RGB TIFFs.
        </Text>
      </Card>
    );
  }

  if (error && !result) {
    const errorTitle =
      error.code === 'not_apple' ? 'Image is not an apple' : 'Could not reach the analysis service';

    return (
      <Card title="Classification unavailable" accent={colors.danger}>
        <Banner
          tone="danger"
          title={errorTitle}
          titleStyle={{ textAlign: 'center', fontSize: 26, width: '100%' }}
          message={error.message}
        />
         
        <Button label="Retry classification" variant="secondary" onPress={onRetry} />
      </Card>
    );
  }

  if (!result) return null;

  if (result.status === 'rejected') {
    const unsupportedFormat = result.rejectionReason === 'unsupported_format';
    const title = unsupportedFormat ? 'Unsupported TIFF format' : 'Image too unclear';

    return (
      <Card title={title} accent={colors.warning}>
        <Banner tone="warning" title={title} message={result.message} />
        {result.quality ? (
          <View style={styles.qualityContainer}>
            <KeyValue label="Sharpness" value={result.quality.sharpness.toFixed(1)} />
            <KeyValue
              label="Blown-out pixels"
              value={formatPercent(result.quality.saturatedRatio * 100)}
            />
          </View>
        ) : null}
        <Button label="Scan something else" variant="secondary" onPress={onRetry} />
      </Card>
    );
  }

  return (
    <Card title="Apple dataset classification" accent={colors.primary}>
      {result.appleClassification ? (
        <Banner
          tone="info"
          title={`${result.appleClassification.label} pesticide is used on this apple`}
        />
      ) : (
        <Banner
          tone="warning"
          title="Classification unavailable"
          message="No apple classification was returned for this scan."
        />
      )}

      <Text style={styles.message}>{result.message}</Text>

      <View style={styles.details}>
        {result.raster ? (
          <KeyValue
            label="Raster"
            value={`${result.raster.width}×${result.raster.height} · ${result.raster.bandCount} bands · ${result.raster.bitsPerSample}-bit`}
            mono
          />
        ) : null}
        {result.inference ? (
          <KeyValue
            label="Inference"
            value={`${result.inference.engine} · ${formatDuration(result.inference.durationMs)}`}
            mono
          />
        ) : null}
        <KeyValue
          label="Archived"
          value={
            result.asset?.skipped
              ? 'Not stored (Cloudinary unavailable)'
              : `Cloudinary · ${formatBytes(result.asset?.bytes ?? result.sizeBytes)}`
          }
          valueColor={result.asset?.skipped ? colors.warning : undefined}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  message: {
    ...typography.body,
    fontSize: typography.body.fontSize ? typography.body.fontSize + 4 : 18,
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  details: {
    marginTop: spacing.lg,
    gap: 8,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e1e4e8',
  },
  waitNote: {
    ...typography.caption,
    fontSize: typography.caption.fontSize ? typography.caption.fontSize + 2 : 14,
    color: colors.textFaint,
    lineHeight: 22,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  qualityContainer: {
    marginVertical: spacing.lg,
    gap: 6,
  },
});

export default AnalysisResultCard;
