import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { MaterialSymbol, SFSymbol, useNavigation, useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { usePatientId } from 'hooks/usePatientId';
import { listAllFolders, moveItem } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { dialog } from '@utils/dialog';

const BRAND = '#7C3AED';

export default function FileMoveScreen({ route }: FilesScreenProps<'FileMoveScreen'>) {
  const { colors, dark } = useTheme();
  const navigation = useNavigation('FileMoveScreen');
  const patientId = usePatientId();
  const { itemKind, itemId, currentFolderId } = route.params;
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof listAllFolders>>>([]);

  useEffect(() => {
    listAllFolders(patientId)
      .then(setFolders)
      .catch((error) => dialog.alert('Folders not available', error instanceof Error ? error.message : 'Unable to load your folders.'));
  }, [patientId]);

  const options = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const labelFor = (id: string): string => {
      const f = byId.get(id);
      if (!f) return 'Unknown';
      return f.parentId ? `${labelFor(f.parentId)} / ${f.name}` : f.name;
    };
    return [
      { id: null as string | null, label: 'All files (root)' },
      ...folders.map((f) => ({ id: f.id as string | null, label: labelFor(f.id) })),
    ];
  }, [folders]);

  const handleMove = async (targetFolderId: string | null) => {
    try {
      await moveItem(patientId, itemKind, itemId, targetFolderId);
      navigation.goBack();
    } catch (error) {
      dialog.alert('Could not move', error instanceof Error ? error.message : 'Unable to move this item.');
    }
  };

  return (
    <ThemedView style={[{ flex: 1 }, { backgroundColor: colors.background }]}>
      <FlatList
        data={options}
        keyExtractor={(item) => item.id ?? 'root'}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <ThemedText style={[styles.help, { color: colors.text }]}>
            Choose where to move this {itemKind}.
          </ThemedText>
        }
        renderItem={({ item }) => {
          const selected = (item.id ?? null) === (currentFolderId ?? null);
          return (
            <Pressable
              onPress={() => handleMove(item.id)}
              disabled={selected}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: selected ? BRAND : dark ? '#1C1633' : '#fff',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: selected ? 'rgba(255,255,255,0.2)' : '#F59E0B1A' }]}>
                {Platform.select({
                  android: <MaterialSymbol name="folder" size={18} color={selected ? '#fff' : '#F59E0B'} />,
                  ios: <SFSymbol name="folder.fill" size={15} color={selected ? '#fff' : '#F59E0B'} />,
                })}
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.rowName, { color: selected ? '#fff' : colors.text }]} numberOfLines={2}>
                  {item.label}
                </ThemedText>
                {selected ? (
                  <ThemedText style={styles.currentLabel}>Current location</ThemedText>
                ) : null}
              </View>
              {selected
                ? Platform.select({
                  android: <MaterialSymbol name="check_circle" size={20} color="#fff" />,
                  ios: <SFSymbol name="checkmark.circle.fill" size={17} color="#fff" />,
                })
                : null}
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  help: { fontSize: 13, opacity: 0.65, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 15, fontWeight: '700' },
  currentLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 2 },
});
