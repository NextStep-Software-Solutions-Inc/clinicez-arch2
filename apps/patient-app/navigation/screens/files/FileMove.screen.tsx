import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import Screen from '../../../components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { listAllFolders, moveItem } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FileMoveScreen({ route }: FilesScreenProps<'FileMoveScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation('FileMoveScreen');
  const patientId = usePatientId();
  const { itemKind, itemId, currentFolderId } = route.params;
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof listAllFolders>>>([]);

  useEffect(() => {
    listAllFolders(patientId)
      .then(setFolders)
      .catch((error) =>
        dialog.alert('Folders not available', error instanceof Error ? error.message : 'Unable to load your folders.')
      );
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
    <Screen width="form" scroll={false}>
      <FlatList
        data={options}
        keyExtractor={(item) => item.id ?? 'root'}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { padding: spacing.lg, gap: spacing.sm }]}
        ListHeaderComponent={
          <ThemedText variant="body" color="textSecondary" style={{ marginBottom: spacing.sm }}>
            Choose where to move this {itemKind}.
          </ThemedText>
        }
        renderItem={({ item }) => {
          const selected = (item.id ?? null) === (currentFolderId ?? null);
          return (
            <Pressable
              onPress={() => handleMove(item.id)}
              disabled={selected}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.row,
                {
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.md,
                  borderWidth: sizes.borderWidth,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.card,
                  opacity: pressed ? 0.75 : 1,
                },
                shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.rowIcon,
                  {
                    width: sizes.controlMd,
                    height: sizes.controlMd,
                    borderRadius: radii.md,
                    backgroundColor: selected ? colors.primaryHover : colors.warningBg,
                  },
                ]}
              >
                <AppIcon
                  name="folder"
                  size={sizes.iconMd}
                  color={selected ? colors.onPrimary : 'warning'}
                />
              </View>
              <View style={styles.flex}>
                <ThemedText
                  variant="bodyBold"
                  color={selected ? colors.onPrimary : 'text'}
                  numberOfLines={2}
                >
                  {item.label}
                </ThemedText>
                {selected ? (
                  <ThemedText
                    variant="caption"
                    color={colors.onPrimary}
                    style={{ opacity: 0.85, marginTop: spacing.xxs }}
                  >
                    Current location
                  </ThemedText>
                ) : null}
              </View>
              {selected ? (
                <AppIcon name="checkCircle" size={sizes.iconMd} color={colors.onPrimary} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
