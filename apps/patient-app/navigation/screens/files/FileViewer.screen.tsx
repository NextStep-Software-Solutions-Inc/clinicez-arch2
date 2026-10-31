import React, { useEffect, useMemo, useState } from 'react';
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
import { useDocumentTypes } from '../../../hooks/useDocumentTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContentInsets } from '../../../hooks/useContentInsets';
import { cleanupPreviewCache, preparePreviewFile, getFileById, deleteItem, renameFile } from '../../../services/files';
import type { PreparedPreviewFile } from '../../../services/files';
import { formatRecordCategoryLabel } from '../../../services/files/documentTypeMapping';
import {
  formatRecordFileName,
  formatRecordSubtitle,
  formatViewerHeaderTitle,
} from '../../../services/files/recordPresentation';
import type { FilesScreenProps } from './navigationTypes';
import RenameModal from '../../../components/ui/RenameModal';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FileViewerScreen({ route }: FilesScreenProps<'FileViewerScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>('FileViewerScreen');
  const patientId = usePatientId();
  const { runWithAutoLockPaused } = useAppAuth();
  const { getToken } = useClerkAuth();
  const { fileId } = route.params;
  const insets = useSafeAreaInsets();
  const contentInsets = useContentInsets();
  const { documentTypes } = useDocumentTypes(patientId);

  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const categoryLabel = useMemo(
    () =>
      formatRecordCategoryLabel(fileMetadata?.documentTypeId, documentTypes) ??
      formatRecordCategoryLabel(fileMetadata?.type, documentTypes) ??
      fileMetadata?.type ??
      null,
    [fileMetadata?.documentTypeId, fileMetadata?.type, documentTypes]
  );

  const viewerHeaderTitle = useMemo(() => {
    if (!fileMetadata && !preview) return undefined;
    return formatViewerHeaderTitle(fileMetadata ?? preview, categoryLabel);
  }, [fileMetadata, preview, categoryLabel]);

  const viewerHeaderSubtitle = useMemo(() => {
    return formatRecordSubtitle(fileMetadata) || undefined;
  }, [fileMetadata]);

  useEffect(() => {
    if (!viewerHeaderTitle) return;
    navigation.setOptions({
      title: viewerHeaderTitle,
      headerTitle: () => (
        <View style={styles.nativeHeaderTitleWrap}>
          <ThemedText variant="bodyBold" numberOfLines={1}>
            {viewerHeaderTitle}
          </ThemedText>
          {viewerHeaderSubtitle ? (
            <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
              {viewerHeaderSubtitle}
            </ThemedText>
          ) : null}
        </View>
      ),
    });
  }, [navigation, viewerHeaderTitle, viewerHeaderSubtitle]);

  useEffect(() => {
    // Hide bottom tab bar while viewing an upload to provide immersive edge-to-edge view
    const parent = navigation.getParent();
    parent?.setOptions?.({ tabBarStyle: { display: 'none' } });
    return () => {
      parent?.setOptions?.({ tabBarStyle: undefined });
    };
  }, [navigation]);

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
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to open this preview.');
      });

    return () => {
      mounted = false;
      cleanupPreviewCache(patientId, fileId).catch(() => {});
    };
  }, [fileId, patientId, getToken]);

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
          dialogTitle: formatRecordFileName(fileMetadata ?? preview),
        })
      );
    } catch (err) {
      dialog.alert('Could not share file', err instanceof Error ? err.message : 'Unable to share this file.');
    }
  };

  const handleDelete = async () => {
    const confirmed = await dialog.confirm({
      title: 'Delete file?',
      message: `Are you sure you want to delete "${formatRecordFileName(fileMetadata ?? preview)}"?`,
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
    await renameFile(patientId, fileId, newName);
    const updated = await getFileById(patientId, fileId);
    setRenameModalOpen(false);
    setFileMetadata((prev: any) => updated ?? { ...prev, name: newName });
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

      {/* Floating Action Toolbar */}
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
            style={({ pressed }) => [styles.toolbarBtn, pressed && styles.toolbarBtnPressed]}
          >
            <AppIcon name="fullscreen" color="text" size={sizes.iconMd} />
            <ThemedText variant="captionBold" color="text">
              Full Screen
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share"
            style={({ pressed }) => [styles.toolbarBtn, pressed && styles.toolbarBtnPressed]}
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
            style={({ pressed }) => [styles.toolbarBtn, pressed && styles.toolbarBtnPressed]}
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
            style={({ pressed }) => [styles.toolbarBtn, pressed && styles.toolbarBtnPressed]}
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

      {renameModalOpen && (fileMetadata || preview) ? (
        <RenameModal
          visible={renameModalOpen}
          initialName={formatRecordFileName(fileMetadata ?? preview)}
          onClose={() => setRenameModalOpen(false)}
          onSave={handleRename}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewer: { flex: 1 },
  previewSurface: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
  nativeHeaderTitleWrap: {
    minWidth: 0,
    maxWidth: '100%',
  },
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
    gap: 4,
    minWidth: 54,
    minHeight: 44,
  },
  toolbarBtnPressed: {
    opacity: 0.6,
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
});
