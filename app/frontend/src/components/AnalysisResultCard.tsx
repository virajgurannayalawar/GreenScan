import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme, { colors, radius, spacing, typography } from '../theme';
import { Banner, Button, Card, KeyValue, LevelBadge, ProgressBar } from './ui';
import { formatBytes, formatDuration, formatPercent } from '../utils/format';
import type { ScanError, ScanResult } from '../types';

/**
 * Renders the backend verdict (Work-II).
 *
 * Three distinct outcomes, each needing different wording:
 *  - scored        -> show the residue percentage
 *  - rejected      -> the subject is not a vegetable, or the frame is unusable
 *  - upload failed -> network/server problem, and the local preview still stands
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
      <Card title="Analysing" subtitle="Uploading to the inference service">
        <ProgressBar progress={uploadProgress} label="Upload" />
        <Text style={styles.waitNote}>
          The server decodes every band, checks the subject is produce, then runs the residue model.
        </Text>
      </Card>
    );
  }

  if (error && !result) {
    return (
      <Card title="Analysis unavailable" accent={colors.danger}>
        <Banner tone="danger" title="Could not reach the analysis service" message={error.message} />
        <Text style={styles.waitNote}>
          The preview above was produced entirely on-device, so it is unaffected.
        </Text>
        <Button label="Retry analysis" variant="secondary" onPress={onRetry} />
      </Card>
    );
  }

  if (!result) return null;

  if (result.status === 'rejected') {
    const isNotVegetable = result.rejectionReason === 'not_vegetable';
    return (
      <Card
        title={isNotVegetable ? 'Not a vegetable' : 'Image too unclear'}
        accent={colors.warning}
      >
        <Banner tone="warning" title={isNotVegetable ? 'No produce detected' : 'Unusable frame'} message={result.message} />

        {result.classification ? (
          <KeyValue
            label="Classifier confidence"
            value={formatPercent((result.classification.confidence ?? 0) * 100)}
          />
        ) : null}
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

  const pesticide = result.pesticide;
  const level = pesticide?.level ?? 'none';
  const accent = theme.residueColors[level];

  return (
    <Card title="Pesticide residue" accent={accent}>
      <View style={styles.headline}>
        <Text style={[styles.percent, { color: accent }]}>
          {pesticide ? pesticide.percent.toFixed(1) : '—'}
          <Text style={styles.percentUnit}>%</Text>
        </Text>
        <LevelBadge level={level} />
      </View>

      <View style={styles.scale}>
        {(['none', 'low', 'moderate', 'high', 'severe'] as const).map((step) => (
          <View
            key={step}
            style={[
              styles.scaleSegment,
              {
                backgroundColor:
                  theme.residueColors[step] + (step === level ? 'FF' : '33'),
              },
            ]}
          />
        ))}
      </View>

      <Text style={styles.message}>{result.message}</Text>

      <View style={styles.details}>
        {pesticide?.confidence !== undefined ? (
          <KeyValue label="Model confidence" value={formatPercent(pesticide.confidence * 100)} />
        ) : null}
        {result.classification ? (
          <KeyValue
            label="Subject"
            value={`${result.classification.label} · ${formatPercent(
              result.classification.confidence * 100,
            )}`}
          />
        ) : null}
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

      {result.inference?.engine === 'stub' ? (
        <Banner
          tone="info"
          title="Stub inference"
          message="The server has no .onnx weights loaded, so this score is deterministic placeholder output — not a real measurement."
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  percent: { fontSize: 46, fontWeight: '800', letterSpacing: -1.5 },
  percentUnit: { fontSize: 22, fontWeight: '700' },

  scale: { flexDirection: 'row', gap: 3, marginVertical: spacing.sm },
  scaleSegment: { flex: 1, height: 6, borderRadius: radius.pill },

  message: { ...typography.body, color: colors.textMuted, lineHeight: 20 },

  details: { marginTop: spacing.sm, gap: 2 },

  waitNote: { ...typography.caption, color: colors.textFaint, lineHeight: 17 },
});

export default AnalysisResultCard;
