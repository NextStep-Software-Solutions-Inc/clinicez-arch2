import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { format } from 'date-fns';
import { and, isNull, eq } from 'drizzle-orm';
import ThemedText from '../../../components/ui/ThemedText';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { AppIcon } from '../../../components/ui/Icon';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import Screen from '../../../components/layout/Screen';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { usePatientId } from '../../../hooks/usePatientId';
import { db } from '../../../db/index';
import { filesMetadata } from '../../../db/schema/filesMetadata';
import type { FileMetadata } from '../../../db/schema/filesMetadata';
import {
  setAttachedFileSelection,
  peekAttachedFileSelection,
} from '../../../services/appointments/attachedFilesStore';

type Props = StaticScreenProps<
  | {
      /** Pre-selected file IDs (e.g. when editing an existing draft) */
      preselectedIds?: string[];
    }
  | undefined
>;

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
  const { colors, radii, spacing, sizes } = useAppTheme();
  const dateLabel = (() => {
    try {
      return format(file.createdAt, 'MMM d, yyyy');
    } catch {
      return '';
    }
  })();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${file.name}, ${selected ? 'selected' : 'unselected'}`}
      style={(state: any) => [
        styles.fileRow,
        {
          borderColor: selected
            ? colors.primary
            : state.hovered
            ? colors.primaryBorder
            : colors.border,
          backgroundColor: selected
            ? colors.primarySubtle
            : state.hovered
            ? colors.surfaceSubtle
            : colors.card,
          borderRadius: radii.lg,
          padding: spacing.md,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.fileIconBox,
          {
            backgroundColor: selected ? colors.primaryLight : colors.surfaceSubtle,
            borderRadius: radii.md,
            width: sizes.controlMd,
            height: sizes.controlMd,
          },
        ]}
      >
        <AppIcon name="document" size={sizes.iconMd} color={selected ? 'primary' : 'textMuted'} />
      </View>
      <View style={styles.flex}>
        <ThemedText variant="bodyBold" numberOfLines={1}>
          {file.name}
        </ThemedText>
        <ThemedText variant="caption" color="textMuted">
          {[file.extension?.toUpperCase(), formatBytes(file.sizeBytes), dateLabel]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : colors.transparent,
            borderRadius: radii.xs,
          },
        ]}
      >
        {selected ? <AppIcon name="check" size={14} color="onPrimary" /> : null}
      </View>
    </Pressable>
  );
}

export default function AttachFilesScreen({ route }: Props) {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const preselectedIds = route.params?.preselectedIds ?? peekAttachedFileSelection();

  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselectedIds));

  useEffect(() => {
    let mounted = true;
    db.select()
      .from(filesMetadata)
      .where(and(eq(filesMetadata.patientId, patientId), isNull(filesMetadata.deletedAt)))
      .orderBy(filesMetadata.createdAt)
      .then((rows) => {
        if (mounted) setFiles(rows);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [patientId]);

  const toggleFile = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDone = () => {
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
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      <View style={styles.header}>
        <ThemedText variant="h2">Attach Files</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          Select files from your storage to share with the clinic.
        </ThemedText>
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={64} radius={radii.lg} />
          <Skeleton height={64} radius={radii.lg} />
          <Skeleton height={64} radius={radii.lg} />
        </View>
      ) : files.length === 0 ? (
        <Card padding="lg" style={styles.emptyCard}>
          <EmptyState
            title="No files yet"
            message="Upload files to your Clinic EZ storage first, then you can attach them to appointments."
            actionLabel="Upload a File"
            onActionPress={handleUploadNew}
          />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              selected={selectedIds.has(file.id)}
              onToggle={() => toggleFile(file.id)}
            />
          ))}

          <Button
            label="Upload a new file"
            variant="outline"
            size="md"
            icon="upload"
            fullWidth
            style={{ marginTop: spacing.sm }}
            onPress={handleUploadNew}
          />
        </View>
      )}

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { gap: spacing.md, paddingTop: spacing.md }]}>
        <Button
          label="Cancel"
          variant="outline"
          size="lg"
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        />
        <Button
          label={`Done${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
          variant="primary"
          size="lg"
          style={styles.flex}
          onPress={handleDone}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    gap: 4,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileIconBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelBtn: {
    minWidth: 100,
  },
});
