// ─────────────────────────────────────────────────────────────────────────────
// Attach Files — formSheet for selecting files to share with a clinic
// Opens as a formSheet from BookingDraft Step 4 or AppointmentDetail.
// On dismiss, the selected file IDs are returned to the caller via the
// navigation "result" pattern — the caller must pass an onSelect callback
// via route.params (not possible with static nav), so we use a focus-listener
// approach: the parent reads selectedFileIds from a shared ref after this
// screen closes. For simplicity we use an Alert-confirmed selection here,
// and the parent screen owns the state.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { and, isNull, eq } from 'drizzle-orm';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { Skeleton } from '@ui/Skeleton';
import { usePatientId } from 'hooks/usePatientId';
import { db } from '@db/index';
import { filesMetadata } from '@db/schema/filesMetadata';
import type { FileMetadata } from '@db/schema/filesMetadata';
import {
    setAttachedFileSelection,
    peekAttachedFileSelection,
} from '../../../services/appointments/attachedFilesStore';

type Props = StaticScreenProps<{
    /** Pre-selected file IDs (e.g. when editing an existing draft) */
    preselectedIds?: string[];
} | undefined>;

function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function FileRow({
    file,
    selected,
    onToggle,
}: {
    file: FileMetadata;
    selected: boolean;
    onToggle: () => void;
}) {
    const { colors } = useTheme();
    const dateLabel = (() => {
        try { return format(file.createdAt, 'MMM d, yyyy'); } catch { return ''; }
    })();
    return (
        <Pressable
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [
                styles.fileRow,
                {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? 'rgba(99,102,241,0.08)' : colors.card,
                    opacity: pressed ? 0.8 : 1,
                },
            ]}
        >
            <View style={[styles.fileIconBox, { backgroundColor: selected ? 'rgba(99,102,241,0.15)' : 'rgba(148,163,184,0.12)' }]}>
                <ThemedText style={styles.fileIcon}>📄</ThemedText>
            </View>
            <View style={styles.fileInfo}>
                <ThemedText style={styles.fileName} numberOfLines={1}>{file.name}</ThemedText>
                <ThemedText style={[styles.fileMeta, { color: colors.text }]}>
                    {[file.extension?.toUpperCase(), formatBytes(file.sizeBytes), dateLabel].filter(Boolean).join(' · ')}
                </ThemedText>
            </View>
            <View
                style={[
                    styles.checkbox,
                    {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : 'transparent',
                    },
                ]}
            >
                {selected ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
            </View>
        </Pressable>
    );
}

export default function AttachFilesScreen({ route }: Props) {
    const { colors } = useTheme();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const patientId = usePatientId();
    const preselectedIds = route.params?.preselectedIds ?? peekAttachedFileSelection();

    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselectedIds));

    useEffect(() => {
        let mounted = true;
        db.select()
            .from(filesMetadata)
            .where(
                and(
                    eq(filesMetadata.patientId, patientId),
                    isNull(filesMetadata.deletedAt)
                )
            )
            .orderBy(filesMetadata.createdAt)
            .then(rows => { if (mounted) setFiles(rows); })
            .finally(() => { if (mounted) setIsLoading(false); });
        return () => { mounted = false; };
    }, [patientId]);

    const toggleFile = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    const handleDone = () => {
        // Write selection to the module store so BookingDraftScreen can read it on focus
        setAttachedFileSelection(Array.from(selectedIds));
        navigation.goBack();
    };

    const handleUploadNew = () => {
        navigation.navigate('Main', {
            screen: 'BottomTabs',
            params: {
                screen: 'FilesScreen',
                params: { screen: 'FilesUploadScreen', params: { folderId: null } },
            },
        });
    };

    return (
        <ThemedView style={styles.screen}>
            <View style={styles.header}>
                <View>
                    <ThemedText style={styles.title}>Attach Files</ThemedText>
                    <ThemedText style={[styles.subtitle, { color: colors.text }]}>
                        Select files from your local storage to share with the clinic.
                    </ThemedText>
                </View>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    {[1, 2, 3].map(i => <Skeleton key={i} height={64} radius={14} />)}
                </View>
            ) : files.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <ThemedText style={styles.emptyIcon}>📂</ThemedText>
                    <ThemedText style={styles.emptyTitle}>No files yet</ThemedText>
                    <ThemedText style={[styles.emptySubtitle, { color: colors.text }]}>
                        Upload files to your ClinicEZ storage first, then you can attach them to appointments.
                    </ThemedText>
                    <Pressable
                        onPress={handleUploadNew}
                        style={[styles.uploadBtn, { backgroundColor: colors.primary }]}
                        accessibilityRole="button"
                    >
                        <ThemedText style={styles.uploadBtnText}>Upload a File</ThemedText>
                    </Pressable>
                </View>
            ) : (
                <FlatList
                    data={files}
                    keyExtractor={f => f.id}
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
                    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    renderItem={({ item }) => (
                        <FileRow
                            file={item}
                            selected={selectedIds.has(item.id)}
                            onToggle={() => toggleFile(item.id)}
                        />
                    )}
                    ListFooterComponent={
                        <Pressable
                            onPress={handleUploadNew}
                            style={[styles.uploadMoreBtn, { borderColor: colors.border }]}
                            accessibilityRole="button"
                        >
                            <ThemedText style={[styles.uploadMoreText, { color: colors.text }]}>
                                ⬆️  Upload a new file
                            </ThemedText>
                        </Pressable>
                    }
                />
            )}

            {/* Bottom action bar */}
            <View
                style={[
                    styles.bottomBar,
                    { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: insets.bottom + 12 },
                ]}
            >
                <Pressable
                    onPress={() => navigation.goBack()}
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                >
                    <ThemedText style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                    onPress={handleDone}
                    style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                    accessibilityRole="button"
                >
                    <ThemedText style={styles.doneBtnText}>
                        Done{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                    </ThemedText>
                </Pressable>
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 20, fontWeight: '800' },
    subtitle: { fontSize: 13, opacity: 0.65, marginTop: 2, lineHeight: 18 },
    loadingContainer: { paddingHorizontal: 16, gap: 8 },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
    emptySubtitle: { fontSize: 14, opacity: 0.65, textAlign: 'center', lineHeight: 20 },
    uploadBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, marginTop: 8 },
    uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    list: { paddingHorizontal: 16, paddingTop: 4, gap: 0 },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1.5,
        padding: 12,
        gap: 10,
    },
    fileIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    fileIcon: { fontSize: 20 },
    fileInfo: { flex: 1, gap: 2 },
    fileName: { fontSize: 14, fontWeight: '600' },
    fileMeta: { fontSize: 11, opacity: 0.6 },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkMark: { color: '#fff', fontSize: 12, fontWeight: '800' },
    uploadMoreBtn: {
        marginTop: 12,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderStyle: 'dashed',
        alignItems: 'center',
    },
    uploadMoreText: { fontSize: 13, fontWeight: '600' },
    bottomBar: {
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 10,
    },
    cancelBtn: {
        paddingHorizontal: 18,
        paddingVertical: 13,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtnText: { fontSize: 14, fontWeight: '600' },
    doneBtn: { flex: 1, paddingVertical: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
