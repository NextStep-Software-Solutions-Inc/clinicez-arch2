import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Button from '@ui/Button';
import Badge from '@ui/Badge';
import { AppIcon, type IconName } from '@ui/Icon';
import { Divider, ProgressBar } from '@ui/Primitives';
import Screen from '../../../components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { formatBytes, getStorageOverview } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { useContentInsets } from '../../../hooks/useContentInsets';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';
import type { ColorToken } from '../../../constants/theme';

const TYPE_META: Record<string, { colorToken: ColorToken; icon: IconName }> = {
  'file-type-xray': { colorToken: 'info', icon: 'activity' },
  'file-type-lab-result': { colorToken: 'success', icon: 'lab' },
  'file-type-medical-certificate': { colorToken: 'warning', icon: 'document' },
  'file-type-prescription': { colorToken: 'emergency', icon: 'pill' },
  'file-type-id': { colorToken: 'purple', icon: 'badge' },
};
const DEFAULT_TYPE: { colorToken: ColorToken; icon: IconName } = { colorToken: 'textSecondary', icon: 'document' };

function typeMeta(id: string) {
  return TYPE_META[id] ?? DEFAULT_TYPE;
}

function iconForFile(f: any) {
  if (f.previewKind === 'image') return { colorToken: 'purple' as ColorToken, icon: 'image' as IconName };
  if (f.previewKind === 'pdf') return { colorToken: 'emergency' as ColorToken, icon: 'pdf' as IconName };
  return typeMeta(f.fileTypeId ?? '');
}

function StorageHero({
  used,
  total,
  pending,
  onUpgrade,
}: {
  used: number;
  total: number;
  pending: number;
  onUpgrade: () => void;
}) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const pctInt = Math.round(pct * 100);
  const isHigh = pct > 0.85;

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: sizes.borderWidth,
          borderRadius: radii.xl,
          padding: spacing.xl,
          gap: spacing.lg,
        },
        shadows.md,
      ]}
    >
      <View style={styles.heroTop}>
        <View
          style={[
            styles.heroIconBox,
            {
              width: sizes.avatarMd,
              height: sizes.avatarMd,
              borderRadius: radii.md,
              backgroundColor: colors.primaryLight,
            },
          ]}
        >
          <AppIcon name="cloud" color="primary" size={sizes.iconLg} />
        </View>
        <View style={[styles.flex, { marginLeft: spacing.md }]}>
          <ThemedText variant="h3">Cloud Storage</ThemedText>
          <View style={{ marginTop: spacing.xs }}>
            <Badge
              tone={pending > 0 ? 'warning' : 'success'}
              label={pending > 0 ? `${pending} pending` : 'Sync active'}
              icon={pending > 0 ? 'sync' : 'check'}
              size="sm"
            />
          </View>
        </View>
        <Button size="sm" variant="secondary" label="Upgrade" onPress={onUpgrade} />
      </View>

      <ProgressBar value={pct} tone={isHigh ? 'danger' : 'primary'} />

      <View style={styles.heroLabels}>
        <ThemedText variant="small" color="textMuted">
          {formatBytes(used)} used
        </ThemedText>
        <ThemedText variant="smallBold" color={isHigh ? 'emergency' : 'text'}>
          {formatBytes(total - used)} free ({pctInt}%)
        </ThemedText>
      </View>
    </View>
  );
}

function StatPills({
  filesCount,
  foldersCount,
  pending,
  avg,
}: {
  filesCount: number;
  foldersCount: number;
  pending: number;
  avg: number;
}) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const pills = [
    { label: 'Files', value: String(filesCount), colorToken: 'info' as ColorToken, icon: 'document' as IconName },
    { label: 'Folders', value: String(foldersCount), colorToken: 'warning' as ColorToken, icon: 'folder' as IconName },
    { label: 'Pending', value: String(pending), colorToken: 'primary' as ColorToken, icon: 'upload' as IconName },
    { label: 'Avg size', value: formatBytes(avg), colorToken: 'success' as ColorToken, icon: 'activity' as IconName },
  ];

  return (
    <View style={[styles.pillsRow, { gap: spacing.sm }]}>
      {pills.map((p) => (
        <View
          key={p.label}
          style={[
            styles.pillCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.md,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.sm,
              gap: spacing.xs,
            },
          ]}
        >
          <View
            style={[
              styles.pillIcon,
              {
                width: sizes.controlSm,
                height: sizes.controlSm,
                borderRadius: radii.sm,
                backgroundColor: colors.surfaceSubtle,
              },
            ]}
          >
            <AppIcon name={p.icon} color={p.colorToken} size={sizes.iconSm} />
          </View>
          <ThemedText variant="bodyBold">{p.value}</ThemedText>
          <ThemedText variant="caption" color="textMuted">
            {p.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

function CategoryChips({ types, onPress }: { types: any[]; onPress: (id: string) => void }) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  if (!types.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipsScroll, { gap: spacing.sm }]}>
      {types.slice(0, 6).map((t) => {
        const m = typeMeta(t.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => onPress(t.id)}
            accessibilityRole="button"
            accessibilityLabel={`${t.label}: ${t.count}`}
            style={({ pressed }) => [
              styles.chip,
              {
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: sizes.borderWidth,
                gap: spacing.xs,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.chipIcon,
                {
                  width: sizes.controlMd,
                  height: sizes.controlMd,
                  borderRadius: radii.md,
                  backgroundColor: colors.surfaceSubtle,
                },
              ]}
            >
              <AppIcon name={m.icon} color={m.colorToken} size={sizes.iconMd} />
            </View>
            <ThemedText variant="smallBold">{t.label}</ThemedText>
            <ThemedText variant="caption" color="textMuted">
              {t.count} files
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FileListRow({
  name,
  subtitle,
  sizeBytes,
  colorToken,
  icon,
}: {
  name: string;
  subtitle: string;
  sizeBytes: number;
  colorToken: ColorToken;
  icon: IconName;
}) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  return (
    <View style={[styles.fileRow, { paddingVertical: spacing.md, gap: spacing.md }]}>
      <View
        style={[
          styles.fileRowIcon,
          {
            width: sizes.controlMd,
            height: sizes.controlMd,
            borderRadius: radii.md,
            backgroundColor: colors.surfaceSubtle,
          },
        ]}
      >
        <AppIcon name={icon} color={colorToken} size={sizes.iconMd} />
      </View>
      <View style={styles.flex}>
        <ThemedText variant="bodyBold" numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      <ThemedText variant="smallBold" color="textSecondary">
        {formatBytes(sizeBytes)}
      </ThemedText>
    </View>
  );
}

export default function StorageScreen(_props: FilesScreenProps<'StorageScreen'>) {
  const { colors, spacing } = useAppTheme();
  const navigation = useNavigation('StorageScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const insets = useContentInsets();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [contents, setContents] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStorageOverview(patientId, getTokenRef.current);
      setContents(data);
    } catch {
      setContents(null);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!contents) return null;
    const files: any[] = contents.files ?? [];
    const filesCount = files.length;
    const foldersCount = (contents.folders ?? []).length;
    const pending = contents.pendingSyncCount ?? 0;
    const total = contents.config?.quotaBytes ?? 0;
    const used = contents.config?.usedStorageBytes ?? 0;

    const byType = new Map<string, { id: string; label: string; count: number; size: number }>();
    for (const f of files) {
      const key = f.fileTypeId ?? 'file-type-other';
      const cur = byType.get(key) ?? { id: key, label: f.typeLabel ?? 'Other', count: 0, size: 0 };
      cur.count += 1;
      cur.size += f.sizeBytes ?? 0;
      byType.set(key, cur);
    }
    const typeList = Array.from(byType.values()).sort((a, b) => b.size - a.size);
    const avg = filesCount ? Math.round(files.reduce((s, f) => s + (f.sizeBytes ?? 0), 0) / filesCount) : 0;
    const recent = [...files]
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, 6);
    const largest = [...files].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)).slice(0, 6);

    return { filesCount, foldersCount, pending, total, used, typeList, avg, recent, largest };
  }, [contents]);

  const handleUpgrade = () => {
    dialog.alert('Coming Soon', 'Upgrade options will be available in a future update.');
  };

  return (
    <Screen
      width="form"
      scroll={true}
      bottomInset={insets.bottom}
      onRefresh={load}
      refreshing={loading}
    >
      <View style={{ gap: spacing.xl }}>
        {loading || !stats ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            <StorageHero
              used={stats.used}
              total={stats.total}
              pending={stats.pending}
              onUpgrade={handleUpgrade}
            />

            <StatPills
              filesCount={stats.filesCount}
              foldersCount={stats.foldersCount}
              pending={stats.pending}
              avg={stats.avg}
            />

            {stats.typeList.length > 0 && (
              <View style={[styles.section, { gap: spacing.sm }]}>
                <ThemedText variant="h3">Categories</ThemedText>
                <CategoryChips types={stats.typeList} onPress={() => navigation.goBack()} />
              </View>
            )}

            {stats.recent.length > 0 && (
              <View style={[styles.section, { gap: spacing.sm }]}>
                <ThemedText variant="h3">Recent</ThemedText>
                <Card padding="md">
                  {stats.recent.map((f: any, idx: number) => {
                    const m = iconForFile(f);
                    const ts = f.createdAt
                      ? new Date(f.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : '';
                    return (
                      <View key={f.id}>
                        <FileListRow
                          name={f.name}
                          subtitle={`${f.typeLabel ?? 'File'}${ts ? '  ·  ' + ts : ''}`}
                          sizeBytes={f.sizeBytes ?? 0}
                          {...m}
                        />
                        {idx < stats.recent.length - 1 && <Divider />}
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}

            {stats.largest.length > 0 && (
              <View style={[styles.section, { gap: spacing.sm }]}>
                <ThemedText variant="h3">Largest files</ThemedText>
                <Card padding="md">
                  {stats.largest.map((f: any, idx: number) => {
                    const m = iconForFile(f);
                    const pct = stats.total > 0 ? Math.round(((f.sizeBytes ?? 0) / stats.total) * 100) : 0;
                    return (
                      <View key={f.id}>
                        <FileListRow
                          name={f.name}
                          subtitle={`${pct}% of your storage`}
                          sizeBytes={f.sizeBytes ?? 0}
                          {...m}
                        />
                        {idx < stats.largest.length - 1 && <Divider />}
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}

            <View style={[styles.actionsRow, { gap: spacing.md }]}>
              <Button
                variant="outline"
                label="Free up space"
                icon="trash"
                style={styles.flex}
                onPress={() =>
                  dialog.alert('Free up space', 'Remove local cached copies of backed up files?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Free up', style: 'destructive', onPress: () => {} },
                  ])
                }
              />
              <Button
                variant="outline"
                label="Export all"
                icon="share"
                style={styles.flex}
                onPress={() => dialog.alert('Export', 'Not implemented yet.')}
              />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { paddingVertical: 80, alignItems: 'center' },
  hero: {},
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroIconBox: { alignItems: 'center', justifyContent: 'center' },
  heroLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  pillsRow: { flexDirection: 'row' },
  pillCard: { flex: 1, alignItems: 'center' },
  pillIcon: { alignItems: 'center', justifyContent: 'center' },
  section: {},
  chipsScroll: { paddingVertical: 2 },
  chip: { alignItems: 'center', minWidth: 88 },
  chipIcon: { alignItems: 'center', justifyContent: 'center' },
  fileRow: { flexDirection: 'row', alignItems: 'center' },
  fileRowIcon: { alignItems: 'center', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row' },
});
