import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '../theme';
import useHistoryStore from '../store/useHistoryStore';
import { Banner, Card, EmptyState, KeyValue, SectionHeader } from '../components/ui';
import { formatPercent, formatRelative } from '../utils/format';
import type { ScanResult } from '../types';

function HistoryRow({ item, onDelete }: { item: ScanResult; onDelete: (id: string) => void }) {
  const rejected = item.status === 'rejected';
  const accent = rejected ? colors.warning : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Scan from ${formatRelative(item.createdAt)}`}
      onLongPress={() => onDelete(item.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowAccent, { backgroundColor: accent }]} />

      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.originalFilename ?? 'Untitled scan'}
          </Text>
          <Text style={styles.rowTime}>{formatRelative(item.createdAt)}</Text>
        </View>

        {rejected ? (
          <Text style={[styles.rowVerdict, { color: colors.warning }]}>
            {item.rejectionReason === 'unsupported_format'
              ? 'Unsupported TIFF format'
              : item.rejectionReason === 'unclear_image'
                ? 'Image unclear'
                : 'Rejected'}
          </Text>
        ) : (
          <View style={styles.rowVerdictRow}>
            <Text style={[styles.rowPercent, { color: accent }]}>
              {item.appleClassification?.label ?? 'Unclassified'}
            </Text>
            {item.appleClassification ? (
              <Text style={styles.rowLevel}>
                {formatPercent(item.appleClassification.confidence * 100)} confidence
              </Text>
            ) : null}
          </View>
        )}

        {item.raster ? (
          <Text style={styles.rowMeta}>
            {item.raster.width}×{item.raster.height} · {item.raster.bandCount} bands
            {item.asset?.skipped ? ' · not archived' : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function HistoryScreen() {
  const insets = useSafeAreaInsets();

  const items = useHistoryStore((s) => s.items);
  const summary = useHistoryStore((s) => s.summary);
  const loading = useHistoryStore((s) => s.loading);
  const refreshing = useHistoryStore((s) => s.refreshing);
  const loadingMore = useHistoryStore((s) => s.loadingMore);
  const hasMore = useHistoryStore((s) => s.hasMore);
  const error = useHistoryStore((s) => s.error);
  const stale = useHistoryStore((s) => s.stale);

  const load = useHistoryStore((s) => s.load);
  const loadMore = useHistoryStore((s) => s.loadMore);
  const remove = useHistoryStore((s) => s.remove);

  // Refetch on focus only when a scan has landed since the last load, so
  // switching tabs does not hammer the API.
  useFocusEffect(
    useCallback(() => {
      if (stale) load();
    }, [stale, load]),
  );

  useEffect(() => {
    if (!summary && !loading) load();
  }, [summary, loading, load]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>History</Text>
      <Text style={styles.subtitle}>Every scan recorded on this device</Text>

      {error ? <Banner tone="danger" title="Could not load history" message={error} /> : null}

      {summary ? (
        <Card title="Summary">
          <View style={styles.statRow}>
            <Stat label="Scans" value={String(summary.total)} />
            <Stat label="Classified" value={String(summary.classified)} />
            <Stat label="Rejected" value={String(summary.rejected)} color={colors.warning} />
          </View>
          <KeyValue label="Result" value="Apple dataset class; no residue estimate" />
          <KeyValue label="Last scan" value={formatRelative(summary.lastScanAt)} />
        </Card>
      ) : null}

      {items.length ? <SectionHeader title="Scans" hint="Long-press a row to delete" /> : null}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl },
      ]}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <HistoryRow item={item} onDelete={remove} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load({ refresh: true })}
          tintColor={colors.primary}
        />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (hasMore) loadMore();
      }}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : (
          <EmptyState
            title="No scans yet"
            message="Run a scan from the Scan tab and the result will be listed here."
          />
        )
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null
      }
    />
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },

  header: { gap: spacing.lg, marginBottom: spacing.lg },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },

  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { ...typography.title, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textMuted },

  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowAccent: { width: 4 },
  rowBody: { flex: 1, padding: spacing.md, gap: spacing.xs },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  rowTime: { ...typography.caption, color: colors.textFaint },
  rowVerdictRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  rowPercent: { fontSize: 22, fontWeight: '800' },
  rowLevel: { ...typography.caption, color: colors.textMuted },
  rowVerdict: { ...typography.subtitle },
  rowMeta: { ...typography.caption, color: colors.textFaint },

  separator: { height: spacing.sm },
  loader: { marginVertical: spacing.xl },
});

export default HistoryScreen;
