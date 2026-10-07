import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialSymbol, SFSymbol, useNavigation, useTheme } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { formatBytes, getStorageOverview } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import CustomAlertModal from '../../../components/ui/CustomAlertModal';
import { dialog } from '@utils/dialog';

const BRAND = '#7C3AED';

// ─── design helpers ───────────────────────────────────────────────────────────
function Ic({ a, i, color, size = 20 }: { a: string; i: string; color: string; size?: number }) {
  return (Platform.select<React.ReactNode>({
    android: <MaterialSymbol name={a as any} size={size} color={color} />,
    ios: <SFSymbol name={i as any} size={size - 2} color={color} />,
  }) ?? null) as React.ReactElement | null;
}

const TYPE_META: Record<string, { color: string; a: string; i: string }> = {
  'file-type-xray': { color: '#3B82F6', a: 'health_and_safety', i: 'waveform.path.ecg' },
  'file-type-lab-result': { color: '#10B981', a: 'science', i: 'flask.fill' },
  'file-type-medical-certificate': { color: '#F59E0B', a: 'verified', i: 'checkmark.seal.fill' },
  'file-type-prescription': { color: '#EF4444', a: 'medication', i: 'cross.case.fill' },
  'file-type-id': { color: '#8B5CF6', a: 'badge', i: 'person.crop.rectangle.fill' },
};
const DEFAULT_TYPE = { color: '#6B7280', a: 'description', i: 'doc.fill' };
function typeMeta(id: string) { return TYPE_META[id] ?? DEFAULT_TYPE; }
function iconForFile(f: any) {
  if (f.previewKind === 'image') return { color: '#EC4899', a: 'image', i: 'photo.fill' };
  if (f.previewKind === 'pdf') return { color: '#EF4444', a: 'picture_as_pdf', i: 'doc.richtext.fill' };
  return typeMeta(f.fileTypeId ?? '');
}

// ─── Hero card ────────────────────────────────────────────────────────────────
function StorageHero({ used, total, pending, onUpgrade }: { used: number; total: number; pending: number; onUpgrade: () => void }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const pctInt = Math.round(pct * 100);
  const isHigh = pct > 0.85;

  return (
    <LinearGradient
      colors={['#5B21B6', '#7C3AED', '#8B5CF6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <ThemedView style={styles.heroTop}>
        <ThemedView style={styles.heroIconBox}>
          {Ic({ a: 'cloud', i: 'icloud.fill', color: '#fff', size: 28 })}
        </ThemedView>
        <ThemedView style={{ flex: 1, marginLeft: 12 }}>
          <ThemedText style={[styles.heroTitle, { color: '#fff' }]}>Cloud Storage</ThemedText>
          <ThemedView style={[
            styles.heroBadge,
            { backgroundColor: pending > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)' },
          ]}>
            {Ic({ a: pending > 0 ? 'sync' : 'cloud_done', i: pending > 0 ? 'arrow.triangle.2.circlepath' : 'checkmark.icloud.fill', color: pending > 0 ? '#FCD34D' : '#6EE7B7', size: 12 })}
            <ThemedText style={[styles.heroBadgeText, { color: pending > 0 ? '#FCD34D' : '#A7F3D0' }]}>
              {pending > 0 ? `${pending} pending` : 'Sync active'}
            </ThemedText>
          </ThemedView>
        </ThemedView>
        <Pressable
          onPress={onUpgrade}
          style={({ pressed }) => [styles.upgradeBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <ThemedText style={[styles.upgradeBtnText, { color: BRAND }]}>Upgrade</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.heroBarTrack}>
        <ThemedView style={[styles.heroBarFill, { width: `${pctInt}%`, backgroundColor: isHigh ? '#FCA5A5' : '#fff' }]} />
      </ThemedView>

      <ThemedView style={styles.heroLabels}>
        <ThemedText style={[styles.heroLabelSm, { color: 'rgba(255,255,255,0.75)' }]}>{formatBytes(used)} used</ThemedText>
        <ThemedText style={[styles.heroLabelBold, { color: '#fff' }]}>{formatBytes(total - used)} free · {pctInt}%</ThemedText>
      </ThemedView>
    </LinearGradient>
  );
}

// ─── Stat pills ───────────────────────────────────────────────────────────────
function StatPills({ filesCount, foldersCount, pending, avg }: { filesCount: number; foldersCount: number; pending: number; avg: number }) {
  const { colors } = useTheme();
  const pills = [
    { label: 'Files', value: String(filesCount), color: '#3B82F6', a: 'insert_drive_file', i: 'doc.fill' },
    { label: 'Folders', value: String(foldersCount), color: '#F59E0B', a: 'folder', i: 'folder.fill' },
    { label: 'Pending', value: String(pending), color: BRAND, a: 'cloud_upload', i: 'icloud.and.arrow.up.fill' },
    { label: 'Avg size', value: formatBytes(avg), color: '#10B981', a: 'data_usage', i: 'chart.bar.fill' },
  ];
  return (
    <ThemedView style={styles.pillsRow}>
      {pills.map((p) => (
        <ThemedView key={p.label} style={[styles.pillCard, { backgroundColor: colors.card }]}>
          <ThemedView style={[styles.pillIcon, { backgroundColor: p.color + '1A' }]}>
            {Ic({ a: p.a, i: p.i, color: p.color, size: 18 })}
          </ThemedView>
          <ThemedText style={styles.pillValue}>{p.value}</ThemedText>
          <ThemedText style={styles.pillLabel}>{p.label}</ThemedText>
        </ThemedView>
      ))}
    </ThemedView>
  );
}

// ─── Category chips ───────────────────────────────────────────────────────────
function CategoryChips({ types, onPress }: { types: any[]; onPress: (id: string) => void }) {
  if (!types.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
      {types.slice(0, 6).map((t) => {
        const m = typeMeta(t.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => onPress(t.id)}
            style={({ pressed }) => [styles.chip, { backgroundColor: m.color + '15', opacity: pressed ? 0.75 : 1 }]}
          >
            <ThemedView style={[styles.chipIcon, { backgroundColor: m.color + '22' }]}>
              {Ic({ a: m.a, i: m.i, color: m.color, size: 22 })}
            </ThemedView>
            <ThemedText style={[styles.chipLabel, { color: m.color }]}>{t.label}</ThemedText>
            <ThemedText style={[styles.chipCount, { color: m.color }]}>{t.count}</ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── File list row ────────────────────────────────────────────────────────────
function FileListRow({ name, subtitle, sizeBytes, color, a, i }: { name: string; subtitle: string; sizeBytes: number; color: string; a: string; i: string }) {
  return (
    <ThemedView style={styles.fileRow}>
      <ThemedView style={[styles.fileRowIcon, { backgroundColor: color + '1A' }]}>
        {Ic({ a, i, color, size: 20 })}
      </ThemedView>
      <ThemedView style={styles.fileRowBody}>
        <ThemedText style={styles.fileRowName} numberOfLines={1}>{name}</ThemedText>
        <ThemedText style={styles.fileRowSub} numberOfLines={1}>{subtitle}</ThemedText>
      </ThemedView>
      <ThemedText style={styles.fileRowSize}>{formatBytes(sizeBytes)}</ThemedText>
    </ThemedView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function StorageScreen({ route }: FilesScreenProps<'StorageScreen'>) {
  const { colors, dark } = useTheme();
  const navigation = useNavigation('StorageScreen');
  const insets = useSafeAreaInsets();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const folderId = (route.params as any)?.folderId ?? null;

  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const [contents, setContents] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStorageOverview(patientId, getTokenRef.current);
      setContents(data);
    } catch { setContents(null); }
    finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

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
    const recent = [...files].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()).slice(0, 6);
    const largest = [...files].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)).slice(0, 6);

    return { filesCount, foldersCount, pending, total, used, typeList, avg, recent, largest };
  }, [contents]);

  const tabBarHeight = useBottomTabBarHeight() || 96 + insets.bottom;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[BRAND]} tintColor={BRAND} />}
    >
      {loading || !stats ? (
        <ThemedView style={styles.loadingWrap}><ActivityIndicator size="large" color={BRAND} /></ThemedView>
      ) : (
        <>
          <StorageHero used={stats.used} total={stats.total} pending={stats.pending} onUpgrade={() => setUpgradeModalOpen(true)} />

          <StatPills
            filesCount={stats.filesCount}
            foldersCount={stats.foldersCount}
            pending={stats.pending}
            avg={stats.avg}
          />

          {stats.typeList.length > 0 && (
            <ThemedView style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Categories</ThemedText>
              <CategoryChips types={stats.typeList} onPress={() => navigation.goBack()} />
            </ThemedView>
          )}

          {stats.recent.length > 0 && (
            <ThemedView style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Recent</ThemedText>
              <ThemedView style={[styles.listCard, { backgroundColor: colors.card }]}>
                {stats.recent.map((f: any, idx: number) => {
                  const m = iconForFile(f);
                  const ts = f.createdAt ? new Date(f.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
                  return (
                    <View key={f.id}>
                      <FileListRow name={f.name} subtitle={`${f.typeLabel ?? 'File'}${ts ? '  ·  ' + ts : ''}`} sizeBytes={f.sizeBytes ?? 0} {...m} />
                      {idx < stats.recent.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    </View>
                  );
                })}
              </ThemedView>
            </ThemedView>
          )}

          {stats.largest.length > 0 && (
            <ThemedView style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Largest files</ThemedText>
              <ThemedView style={[styles.listCard, { backgroundColor: colors.card }]}>
                {stats.largest.map((f: any, idx: number) => {
                  const m = iconForFile(f);
                  const pct = stats.total > 0 ? Math.round(((f.sizeBytes ?? 0) / stats.total) * 100) : 0;
                  return (
                    <ThemedView key={f.id}>
                      <FileListRow name={f.name} subtitle={`${pct}% of your storage`} sizeBytes={f.sizeBytes ?? 0} {...m} />
                      {idx < stats.largest.length - 1 && <ThemedView style={[styles.divider, { backgroundColor: colors.border }]} />}
                    </ThemedView>
                  );
                })}
              </ThemedView>
            </ThemedView>
          )}

          <ThemedView style={styles.actionsRow}>
            <Pressable
              onPress={() => dialog.alert('Free up space', 'Remove local cached copies of backed up files?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Free up', style: 'destructive', onPress: () => { } },
              ])}
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: dark ? '#1C1633' : '#fff', opacity: pressed ? 0.8 : 1 }]}
            >
              {Ic({ a: 'cleaning_services', i: 'trash.fill', color: BRAND, size: 18 })}
              <ThemedText style={[styles.actionBtnText, { color: colors.text }]}>Free up space</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => dialog.alert('Export', 'Not implemented yet.')}
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: dark ? '#1C1633' : '#fff', opacity: pressed ? 0.8 : 1 }]}
            >
              {Ic({ a: 'ios_share', i: 'square.and.arrow.up', color: BRAND, size: 18 })}
              <ThemedText style={[styles.actionBtnText, { color: colors.text }]}>Export all</ThemedText>
            </Pressable>
          </ThemedView>
        </>
      )}

      <CustomAlertModal
        visible={upgradeModalOpen}
        title="Coming Soon"
        message="Upgrade options will be available in a future update."
        icon="🚀"
        onClose={() => setUpgradeModalOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  handleRow: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  handle: { flex: 1, height: 4, borderRadius: 2, marginHorizontal: 60, opacity: 0.3 },
  closeBtn: { position: 'absolute', right: 16, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 20 },
  loadingWrap: { paddingTop: 80, alignItems: 'center' },

  // hero
  hero: { borderRadius: 20, padding: 20, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroIconBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 16, fontWeight: '800' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 4, alignSelf: 'flex-start' },
  heroBadgeText: { fontSize: 11, fontWeight: '700' },
  upgradeBtn: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  upgradeBtnText: { fontSize: 13, fontWeight: '800' },
  heroBarTrack: { height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  heroBarFill: { height: '100%', borderRadius: 999 },
  heroLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  heroLabelSm: { fontSize: 12, fontWeight: '600' },
  heroLabelBold: { fontSize: 12, fontWeight: '800' },

  // stat pills
  pillsRow: { flexDirection: 'row', gap: 10 },
  pillCard: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  pillIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pillValue: { fontSize: 15, fontWeight: '800' },
  pillLabel: { fontSize: 10, fontWeight: '600', opacity: 0.6, textAlign: 'center' },

  // sections
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginLeft: 2 },
  chipsScroll: { gap: 10, paddingVertical: 2 },
  chip: { alignItems: 'center', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 6, minWidth: 80 },
  chipIcon: { width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 12, fontWeight: '700' },
  chipCount: { fontSize: 11, fontWeight: '600', opacity: 0.75 },

  // file rows
  listCard: { borderRadius: 16, paddingHorizontal: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  fileRowIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  fileRowBody: { flex: 1, minWidth: 0 },
  fileRowName: { fontSize: 14, fontWeight: '700' },
  fileRowSub: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  fileRowSize: { fontSize: 12, fontWeight: '700', opacity: 0.75 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },

  // actions
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});

