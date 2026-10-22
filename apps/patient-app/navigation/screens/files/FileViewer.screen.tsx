import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ZoomableImage from '../../../components/ui/ZoomableImage';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import Pdf from 'react-native-pdf';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { usePatientId } from 'hooks/usePatientId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContentInsets } from '../../../hooks/useContentInsets';
import { cleanupPreviewCache, preparePreviewFile, getFileById, deleteItem, renameFile } from '../../../services/files';
import type { PreparedPreviewFile } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import RenameModal from '../../../components/ui/RenameModal';
import Badge from '../../../components/ui/Badge';
import { ProvenanceBadge } from '../../../components/records/ProvenanceBadge';
import { ClinicalUrgencyBadge } from '../../../components/records/ClinicalUrgencyBadge';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FileViewerScreen({ route }: FilesScreenProps<'FileViewerScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation('FileViewerScreen');
  const patientId = usePatientId();
  const { runWithAutoLockPaused } = useAppAuth();
  const { getToken } = useClerkAuth();
  const { fileId } = route.params;
  const insets = useSafeAreaInsets();
  const contentInsets = useContentInsets();

  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      preparePreviewFile(patientId, fileId, getToken),
      getFileById(patientId, fileId),
    ])
      .then(([previewRes, fileRes]) => {
        if (!mounted) return;
        setPreview(previewRes);
        setFileMetadata(fileRes);
        navigation.setOptions({ title: fileRes?.name || previewRes.name });
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to open this preview.');
      });

    return () => {
      mounted = false;
      cleanupPreviewCache(patientId, fileId).catch(() => {});
    };
  }, [fileId, navigation, patientId, getToken]);

  const handleShare = async () => {
    if (!preview) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        dialog.alert('No app available', 'This device cannot share files with other apps.');
        return;
      }
      await runWithAutoLockPaused(() =>
        Sharing.shareAsync(preview.uri, {
          mimeType: preview.mimeType,
          dialogTitle: preview.name,
        })
      );
    } catch (err) {
      dialog.alert('Could not share file', err instanceof Error ? err.message : 'Unable to share this file.');
    }
  };

  const handleDelete = async () => {
    const confirmed = await dialog.confirm({
      title: 'Delete file?',
      message: `Are you sure you want to delete "${fileMetadata?.name || preview?.name}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteItem(patientId, fileId, getToken);
      navigation.goBack();
    } catch (err) {
      dialog.alert('Could not delete', err instanceof Error ? err.message : 'Unknown error');
    }
  };



  const handleRename = async (newName: string) => {
    try {
      await renameFile(patientId, fileId, newName);
      setRenameModalOpen(false);
      navigation.setOptions({ title: newName });
      setFileMetadata((prev: any) => ({ ...prev, name: newName }));
    } catch (err) {
      throw err;
    }
  };

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md }]}>
        <AppIcon name="alert" size={sizes.iconXl} color="emergency" />
        <ThemedText variant="h3">Preview not available</ThemedText>
        <ThemedText variant="body" color="textMuted" style={styles.textCenter}>
          {error}
        </ThemedText>
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, gap: spacing.md }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText variant="body" color="textMuted">
          Preparing preview...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.viewer, { backgroundColor: colors.background }]}>
      {/* Top Clinical Header Bar */}
      <View
        style={[
          styles.clinicalHeaderCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderBottomWidth: sizes.borderWidth,
            padding: spacing.md,
            gap: spacing.xs,
          },
          shadows.sm,
        ]}
      >
        <View style={styles.headerTitleRow}>
          <ThemedText variant="bodyBold" numberOfLines={1} style={styles.headerTitleText}>
            {fileMetadata?.title || fileMetadata?.name || preview?.name}
          </ThemedText>
          <View style={styles.headerBadgesRow}>
            {fileMetadata?.type ? (
              <Badge label={fileMetadata.type} tone="neutral" size="sm" />
            ) : null}
            <ClinicalUrgencyBadge
              urgency={fileMetadata?.urgency}
              isCritical={fileMetadata?.isCritical}
            />
            <ProvenanceBadge
              provenance={fileMetadata?.provenance}
              clinicId={fileMetadata?.clinicId}
              facilityName={fileMetadata?.facilityName}
              compact
            />
          </View>
        </View>

        <View style={styles.headerMetaRow}>
          {fileMetadata?.facilityName ? (
            <View style={styles.metaItem}>
              <AppIcon name="hospital" size={sizes.iconSm} color="textMuted" />
              <ThemedText variant="caption" color="textMuted">
                {fileMetadata.facilityName}
              </ThemedText>
            </View>
          ) : null}
          {(fileMetadata?.documentDate || fileMetadata?.createdAt) ? (
            <View style={styles.metaItem}>
              <AppIcon name="calendar" size={sizes.iconSm} color="textMuted" />
              <ThemedText variant="caption" color="textMuted">
                {fileMetadata.documentDate ||
                  new Date(fileMetadata.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {fileMetadata?.notes ? (
          <View
            style={[
              styles.notesWrap,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.md,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <ThemedText variant="caption" color="textSecondary" numberOfLines={2}>
              {fileMetadata.notes}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.previewSurface}>
        {preview.previewKind === 'image' ? (
          <ZoomableImage uri={preview.uri} />
        ) : preview.previewKind === 'pdf' ? (
          <Pdf
            source={{ uri: preview.uri }}
            style={[styles.pdf, { backgroundColor: colors.background }]}
            trustAllCerts={false}
          />
        ) : (
          <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
            <AppIcon name="document" size={sizes.avatarLg} color="textMuted" />
            <ThemedText variant="h3">Preview not available</ThemedText>
            <ThemedText variant="body" color="textMuted" style={styles.textCenter}>
              This file type cannot be previewed directly within the app. You can share it to open it in another app.
            </ThemedText>
          </View>
        )}
      </View>

      <View
        style={[
          styles.floatingToolbarWrap,
          { paddingBottom: Math.max(insets.bottom, contentInsets.bottom) + spacing.md },
        ]}
      >
        <View
          style={[
            styles.floatingToolbar,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
            },
            shadows.lg,
          ]}
        >
          <Pressable
            onPress={() => setIsFullScreen(true)}
            accessibilityRole="button"
            accessibilityLabel="Full Screen"
            style={styles.toolbarBtn}
          >
            <AppIcon name="externalLink" color="text" size={sizes.iconMd} />
            <ThemedText variant="captionBold" color="text">
              Full Screen
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share"
            style={styles.toolbarBtn}
          >
            <AppIcon name="share" color="text" size={sizes.iconMd} />
            <ThemedText variant="captionBold" color="text">
              Share
            </ThemedText>
          </Pressable>



          <Pressable
            onPress={() => setRenameModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Rename"
            style={styles.toolbarBtn}
          >
            <AppIcon name="edit" color="text" size={sizes.iconMd} />
            <ThemedText variant="captionBold" color="text">
              Rename
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            style={styles.toolbarBtn}
          >
            <AppIcon name="trash" color="emergency" size={sizes.iconMd} />
            <ThemedText variant="captionBold" color="emergency">
              Delete
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={isFullScreen}
        transparent={false}
        onRequestClose={() => setIsFullScreen(false)}
        animationType="fade"
      >
        <GestureHandlerRootView style={[styles.flex, { backgroundColor: colors.overlay }]}>
          <View style={[styles.closeOverlayBtnWrap, { top: Math.max(insets.top, spacing.lg) + spacing.md, right: spacing.lg }]}>
            <Pressable
              onPress={() => setIsFullScreen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close full screen"
              style={[
                styles.closeOverlayBtn,
                {
                  borderRadius: radii.full,
                  backgroundColor: colors.surfaceSubtle,
                  padding: spacing.sm,
                },
              ]}
            >
              <AppIcon name="close" color="text" size={sizes.iconLg} />
            </Pressable>
          </View>
          {preview.previewKind === 'image' ? (
            <ZoomableImage uri={preview.uri} />
          ) : preview.previewKind === 'pdf' ? (
            <Pdf
              source={{ uri: preview.uri }}
              style={[styles.pdf, { backgroundColor: colors.overlay }]}
              trustAllCerts={false}
            />
          ) : null}
        </GestureHandlerRootView>
      </Modal>

      {renameModalOpen && fileMetadata && (
        <RenameModal
          visible={renameModalOpen}
          initialName={fileMetadata.name}
          onClose={() => setRenameModalOpen(false)}
          onSave={handleRename}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewer: { flex: 1 },
  previewSurface: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
  floatingToolbarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    pointerEvents: 'box-none',
  },
  floatingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 420,
  },
  toolbarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 52,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  closeOverlayBtnWrap: {
    position: 'absolute',
    zIndex: 100,
  },
  closeOverlayBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicalHeaderCard: {
    width: '100%',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerTitleText: {
    flex: 1,
    flexShrink: 1,
  },
  headerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notesWrap: {
    marginTop: 2,
  },
});
