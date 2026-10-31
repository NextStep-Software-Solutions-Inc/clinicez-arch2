import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { mutate } from 'swr';
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
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { runWithAutoLockPaused } = useAppAuth();
  const { getToken } = useClerkAuth();
  const { fileId } = route.params;
  const insets = useSafeAreaInsets();
  const { documentTypes } = useDocumentTypes(patientId);

  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('FilesBrowserScreen');
    }
  }, [navigation]);

  useEffect(() => {
    const onBackPress = () => {
      handleGoBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [handleGoBack]);

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
    navigation.setOptions({
      title: viewerHeaderTitle ?? 'Preview',
      headerLeft: () => (
        <Pressable
          onPress={handleGoBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ paddingRight: spacing.md, paddingVertical: spacing.xs, justifyContent: 'center' }}
        >
          <AppIcon name="back" size={sizes.iconLg} color="text" />
        </Pressable>
      ),
      headerTitle: () => (
        <View style={styles.nativeHeaderTitleWrap}>
          <ThemedText variant="bodyBold" numberOfLines={1}>
            {viewerHeaderTitle ?? 'Preview'}
          </ThemedText>
          {viewerHeaderSubtitle ? (
            <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
              {viewerHeaderSubtitle}
            </ThemedText>
          ) : null}
        </View>
      ),
    });
  }, [navigation, viewerHeaderTitle, viewerHeaderSubtitle, handleGoBack, spacing.md, spacing.xs, sizes.iconLg]);

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
    try {
      const available = await Sharing.isAvailableAsync().catch(() => false);
      if (!available) {
        dialog.alert('No app available', 'This device cannot share files with other apps.');
        return;
      }
      const freshPreview = await preparePreviewFile(patientId, fileId, getToken);
      await runWithAutoLockPaused(() =>
        Sharing.shareAsync(freshPreview.uri, {
          mimeType: freshPreview.mimeType,
          dialogTitle: formatRecordFileName(fileMetadata ?? freshPreview),
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
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
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

      {/* Docked Native Bottom Action Toolbar */}
      <View
        style={[
          styles.bottomToolbar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.borderLight,
            paddingBottom: Math.max(insets.bottom, spacing.xs),
            paddingTop: spacing.xs,
          },
        ]}
      >
        <View style={styles.bottomToolbarInner}>
          <Pressable
            onPress={() => setIsFullScreen(true)}
            accessibilityRole="button"
            accessibilityLabel="Full Screen"
            hitSlop={8}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          >
            <AppIcon name="fullscreen" color="text" size={sizes.iconLg - 2} />
            <ThemedText variant="captionBold" color="text">
              Full Screen
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share"
            hitSlop={8}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          >
            <AppIcon name="share" color="text" size={sizes.iconLg - 2} />
            <ThemedText variant="captionBold" color="text">
              Share
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setRenameModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Rename"
            hitSlop={8}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          >
            <AppIcon name="edit" color="text" size={sizes.iconLg - 2} />
            <ThemedText variant="captionBold" color="text">
              Rename
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            hitSlop={8}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          >
            <AppIcon name="trash" color="emergency" size={sizes.iconLg - 2} />
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
  bottomToolbar: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    elevation: 4,
  },
  bottomToolbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 64,
    minHeight: 48,
    paddingVertical: 4,
  },
  actionBtnPressed: {
    opacity: 0.5,
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
