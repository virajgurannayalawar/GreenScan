import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import config from '../config/env';
import { colors, radius, spacing, typography } from '../theme';
import useProfileStore from '../store/useProfileStore';
import useScanStore from '../store/useScanStore';
import { Banner, Button, Card, KeyValue, SectionHeader, Stepper } from '../components/ui';
import { bandName, formatPercent, formatRelative } from '../utils/format';

const MAX_BAND_INDEX = 5;

export function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const profile = useProfileStore((s) => s.profile);
  const deviceId = useProfileStore((s) => s.deviceId);
  const loading = useProfileStore((s) => s.loading);
  const saving = useProfileStore((s) => s.saving);
  const error = useProfileStore((s) => s.error);
  const backendStatus = useProfileStore((s) => s.backendStatus);
  const backendDetail = useProfileStore((s) => s.backendDetail);

  const load = useProfileStore((s) => s.load);
  const save = useProfileStore((s) => s.save);
  const setBandMapping = useProfileStore((s) => s.setBandMapping);
  const checkBackend = useProfileStore((s) => s.checkBackend);

  const mapping = useScanStore((s) => s.mapping);

  const [displayName, setDisplayName] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [region, setRegion] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    load();
    checkBackend();
  }, [load, checkBackend]);

  // Seed the inputs once the profile arrives, without clobbering in-progress edits.
  useEffect(() => {
    if (!profile || dirty) return;
    setDisplayName(profile.displayName ?? '');
    setOrganisation(profile.organisation ?? '');
    setRegion(profile.region ?? '');
  }, [profile, dirty]);

  const onSave = async () => {
    await save({ displayName, organisation, region });
    setDirty(false);
  };

  const models = (backendDetail?.dependencies as { models?: Record<string, string> } | undefined)
    ?.models;

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
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Operator details and sensor configuration</Text>
      </View>

      {error ? (
        <Banner
          tone="warning"
          title="Profile not synced"
          message={error}
          action={<Button label="Retry" variant="ghost" onPress={load} />}
        />
      ) : null}

      <Card title="Operator">
        <Field label="Name" value={displayName} onChangeText={(v) => { setDisplayName(v); setDirty(true); }} placeholder="Field Operator" />
        <Field
          label="Organisation"
          value={organisation}
          onChangeText={(v) => { setOrganisation(v); setDirty(true); }}
          placeholder="e.g. State Agriculture Lab"
        />
        <Field label="Region" value={region} onChangeText={(v) => { setRegion(v); setDirty(true); }} placeholder="e.g. Pune District" />
        <Button
          label={dirty ? 'Save changes' : 'Saved'}
          onPress={onSave}
          loading={saving}
          disabled={!dirty || loading}
          style={styles.saveButton}
        />
      </Card>

      {/*
        Band mapping lives here rather than being hard-coded because the index
        of each wavelength is sensor-specific. A MicaSense RedEdge writes
        Blue,Green,Red,NIR,RedEdge; another vendor may write them in any order.
        Set it once and both the GPU preview and the server-side preview tensor
        follow it.
      */}
      <Card
        title="Band mapping"
        subtitle="Which raw band drives each screen channel in the false-colour composite"
      >
        <Stepper
          label="Red ← "
          value={mapping.red}
          min={0}
          max={MAX_BAND_INDEX}
          format={bandName}
          onChange={(value) => setBandMapping({ red: value })}
        />
        <Stepper
          label="Green ← "
          value={mapping.green}
          min={0}
          max={MAX_BAND_INDEX}
          format={bandName}
          onChange={(value) => setBandMapping({ green: value })}
        />
        <Stepper
          label="Blue ← "
          value={mapping.blue}
          min={0}
          max={MAX_BAND_INDEX}
          format={bandName}
          onChange={(value) => setBandMapping({ blue: value })}
        />
        <Text style={styles.note}>
          Default assumes a 5-band layout: Blue, Green, Red, NIR, Red Edge — giving the spec's
          NIR → red, Red Edge → green, Green → blue composite.
        </Text>
      </Card>

      <Card title="Activity">
        <KeyValue label="Total scans" value={String(profile?.stats.totalScans ?? 0)} />
        <KeyValue
          label="Rejected"
          value={String(profile?.stats.rejectedScans ?? 0)}
          valueColor={profile?.stats.rejectedScans ? colors.warning : undefined}
        />
        <KeyValue label="Last scan" value={formatRelative(profile?.stats.lastScanAt)} />
        <KeyValue
          label="Rejection rate"
          value={
            profile?.stats.totalScans
              ? formatPercent((profile.stats.rejectedScans / profile.stats.totalScans) * 100)
              : '—'
          }
        />
      </Card>

      <View>
        <SectionHeader title="Diagnostics" />
        <Card title="Backend">
          <KeyValue label="API endpoint" value={config.apiBaseUrl} mono />
          <KeyValue
            label="Status"
            value={
              backendStatus === 'online'
                ? 'Online'
                : backendStatus === 'offline'
                  ? 'Unreachable'
                  : 'Checking…'
            }
            valueColor={
              backendStatus === 'online'
                ? colors.primary
                : backendStatus === 'offline'
                  ? colors.danger
                  : undefined
            }
          />
          {models ? (
            <>
              <KeyValue label="Vegetable gate" value={models.gate} mono />
              <KeyValue label="Residue model" value={models.residue} mono />
            </>
          ) : null}
          <KeyValue label="Device id" value={deviceId ?? '—'} mono />
          <Button label="Re-check" variant="ghost" onPress={checkBackend} style={styles.saveButton} />

          {models && (models.gate === 'stub' || models.residue === 'stub') ? (
            <Banner
              tone="info"
              title="Stub models in use"
              message="Drop the .onnx files into backend/models and restart the API for real scores."
            />
          ) : null}
        </Card>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },

  header: { gap: 2 },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },

  field: { gap: spacing.xs, marginBottom: spacing.sm },
  fieldLabel: { ...typography.caption, color: colors.textMuted },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },

  saveButton: { marginTop: spacing.sm },
  note: { ...typography.caption, color: colors.textFaint, lineHeight: 17, marginTop: spacing.sm },
});

export default ProfileScreen;
