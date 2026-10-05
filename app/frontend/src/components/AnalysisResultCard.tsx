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
    return (
      <Card title="Classification unavailable" accent={colors.danger}>
        <Banner tone="danger" title="Could not reach the analysis service" message={error.message} />
        <Text style={styles.waitNote}>
          The preview above was produced entirely on-device, so it is unaffected.
        </Text>
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
          <>
            <KeyValue label="Sharpness" value={result.quality.sharpness.toFixed(1)} />
            <KeyValue
              label="Blown-out pixels"
              value={formatPercent(result.quality.saturatedRatio * 100)}
            />
          </>
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
          title={`${result.appleClassification.label} · ${formatPercent(
            result.appleClassification.confidence * 100,
          )} confidence`}
         
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
  message: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  details: { marginTop: spacing.sm, gap: 2 },
  waitNote: { ...typography.caption, color: colors.textFaint, lineHeight: 17 },
});

export default AnalysisResultCard;
