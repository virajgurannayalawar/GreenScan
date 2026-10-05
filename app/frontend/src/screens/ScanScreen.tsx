import React, { useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';
import useScanStore from '../store/useScanStore';
import StartScanButton from '../components/StartScanButton';
import TiffUploadWidget from '../components/TiffUploadWidget';
import MultispectralViewer from '../components/MultispectralViewer';
import AnalysisResultCard from '../components/AnalysisResultCard';
import {
  Banner,
  Button,
  Card,
  KeyValue,
  ProgressBar,
  SectionHeader,
  SegmentedRow,
  Stepper,
} from '../components/ui';
import { purgeCache } from '../services/nativeFile';
import { bandName, formatBytes, formatDuration } from '../utils/format';
import type { RenderMode } from '../types';

const MAX_BAND_INDEX = 5;

export function ScanScreen() {
  const insets = useSafeAreaInsets();

  const phase = useScanStore((s) => s.phase);
  const cameraReport = useScanStore((s) => s.cameraReport);
  const file = useScanStore((s) => s.file);
  const packed = useScanStore((s) => s.packed);
  const textures = useScanStore((s) => s.textures);
  const decodeProgress = useScanStore((s) => s.decodeProgress);
  const decodeError = useScanStore((s) => s.decodeError);
  const uploading = useScanStore((s) => s.uploading);
  const uploadProgress = useScanStore((s) => s.uploadProgress);
  const uploadError = useScanStore((s) => s.uploadError);
  const result = useScanStore((s) => s.result);
  const mapping = useScanStore((s) => s.mapping);
  const renderMode = useScanStore((s) => s.renderMode);
  const gain = useScanStore((s) => s.gain);
  const gamma = useScanStore((s) => s.gamma);

  const startScan = useScanStore((s) => s.startScan);
  const chooseFile = useScanStore((s) => s.chooseFile);
  const retryUpload = useScanStore((s) => s.retryUpload);
  const setMapping = useScanStore((s) => s.setMapping);
  const setRenderMode = useScanStore((s) => s.setRenderMode);
  const setGain = useScanStore((s) => s.setGain);
  const setGamma = useScanStore((s) => s.setGamma);
  const reset = useScanStore((s) => s.reset);

  // Clear last session's cached slices and file copies on first mount.
  useEffect(() => {
    purgeCache();
  }, []);

  const handleRetry = useCallback(() => {
    if (result?.status === 'rejected') {
      reset();
      return;
    }
    retryUpload();
  }, [result, reset, retryUpload]);

  const busy = phase === 'probing-camera';
  const showIdle = phase === 'idle' || phase === 'probing-camera';
  const showUploadWidget = phase === 'awaiting-file';
  const showWorkspace = phase === 'decoding' || phase === 'ready' || phase === 'error';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>GreenScan</Text>
        <Text style={styles.subtitle}> AI Pesticide Scanner</Text>
      </View>

      {showIdle ? (
        <View style={styles.idleBlock}>
          <StartScanButton
            onPress={startScan}
            busy={busy}
            caption={
              busy
                ? 'Checking the camera hardware…'
                : ' '
            }
          />

           
        </View>
      ) : null}

      {showUploadWidget ? (
        <TiffUploadWidget
          report={cameraReport}
          onPickFile={chooseFile}
          onCancel={reset}
          busy={false}
        />
      ) : null}

      {showWorkspace ? (
        <View style={styles.workspace}>
          {file ? (
            <Card title={file.name} subtitle={`${formatBytes(file.size)} · ${file.mimeType ?? 'image/tiff'}`}>
              {phase === 'decoding' ? (
                <>
                  <ProgressBar progress={decodeProgress} label="Decoding bands" />
                  <ProgressBar progress={uploadProgress} label="Uploading" color={colors.info} />
                </>
              ) : null}
            </Card>
          ) : null}

          {/* ---------------- Work-I: on-device false-colour render ---------------- */}
          <View>
            <SectionHeader
              title="False-colour composite"
              hint={
                packed
                  ? `${packed.metadata.width}×${packed.metadata.height} source · ${packed.metadata.bandCount} bands · decoded in ${formatDuration(packed.decodeMs)}`
                  : 'Rendering on the GPU'
              }
            />

            {textures && packed ? (
              <MultispectralViewer
                textures={textures}
                stretches={packed.stretches}
                bandCount={packed.metadata.bandCount}
                mapping={mapping}
                renderMode={renderMode}
                gain={gain}
                gamma={gamma}
              />
            ) : decodeError ? (
              <Banner
                tone="warning"
                title="On-device preview unavailable"
                message={decodeError.message}
                action={
                  <Text style={styles.inlineNote}>
                    Server-side analysis is unaffected — the result below still applies to this file.
                  </Text>
                }
              />
            ) : (
              <Card title="Decoding…">
                <ProgressBar progress={decodeProgress} label="Streaming bands" />
              </Card>
            )}
          </View>

          {textures && packed ? (
            <Card title="Render controls">
              <SegmentedRow<RenderMode>
                value={renderMode}
                onChange={setRenderMode}
                options={[
                  { value: 'false-color', label: 'False colour' },
                  { value: 'ndvi', label: 'NDVI' },
                ]}
              />

              {renderMode === 'false-color' ? (
                <>
                  <Stepper
                    label="Red channel"
                    value={mapping.red}
                    min={0}
                    max={Math.min(MAX_BAND_INDEX, packed.metadata.bandCount - 1)}
                    format={bandName}
                    onChange={(value) => setMapping({ red: value, nir: value })}
                  />
                  <Stepper
                    label="Green channel"
                    value={mapping.green}
                    min={0}
                    max={Math.min(MAX_BAND_INDEX, packed.metadata.bandCount - 1)}
                    format={bandName}
                    onChange={(value) => setMapping({ green: value })}
                  />
                  <Stepper
                    label="Blue channel"
                    value={mapping.blue}
                    min={0}
                    max={Math.min(MAX_BAND_INDEX, packed.metadata.bandCount - 1)}
                    format={bandName}
                    onChange={(value) => setMapping({ blue: value })}
                  />
                </>
              ) : (
                <>
                  <Stepper
                    label="NIR band"
                    value={mapping.nir}
                    min={0}
                    max={Math.min(MAX_BAND_INDEX, packed.metadata.bandCount - 1)}
                    format={bandName}
                    onChange={(value) => setMapping({ nir: value })}
                  />
                  <Stepper
                    label="Red band"
                    value={mapping.redBand}
                    min={0}
                    max={Math.min(MAX_BAND_INDEX, packed.metadata.bandCount - 1)}
                    format={bandName}
                    onChange={(value) => setMapping({ redBand: value })}
                  />
                </>
              )}

              <Stepper
                label="Gain"
                value={gain}
                min={0.2}
                max={4}
                step={0.05}
                format={(value) => value.toFixed(2)}
                onChange={setGain}
              />
              <Stepper
                label="Gamma"
                value={gamma}
                min={0.2}
                max={3}
                step={0.05}
                format={(value) => value.toFixed(2)}
                onChange={setGamma}
              />
            </Card>
          ) : null}

          {/* ---------------- Work-II: backend verdict ---------------- */}
          <View>
            <SectionHeader title="Analysis" hint="Cloudinary archive · ONNX inference" />
            <AnalysisResultCard
              result={result}
              uploading={uploading}
              uploadProgress={uploadProgress}
              error={uploadError}
              onRetry={handleRetry}
            />
          </View>

          <Button label="New scan" variant="secondary" onPress={reset} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  header: { gap: 2 },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },

  idleBlock: { gap: spacing.xxl, alignItems: 'stretch', paddingTop: spacing.xl },

  workspace: { gap: spacing.xl },

  inlineNote: { ...typography.caption, color: colors.textFaint, lineHeight: 17 },
});

export default ScanScreen;
