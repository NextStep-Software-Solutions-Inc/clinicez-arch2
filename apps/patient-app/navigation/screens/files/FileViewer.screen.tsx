import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  GestureHandlerRootView,
  TouchableOpacity as RNGHTouchableOpacity,
} from 'react-native-gesture-handler';
import { mutate } from 'swr';
import ZoomableImage from '../../../components/ui/ZoomableImage';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import Pdf from 'react-native-pdf';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentTypes } from '../../../hooks/useDocumentTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cleanupPreviewCache,
  preparePreviewFile,
  getFileById,
  deleteItem,
  renameFile,
} from '../../../services/files';
import type { PreparedPreviewFile } from '../../../services/files';
import { formatRecordCategoryLabel } from '../../../services/files/documentTypeMapping';
import {
  formatRecordFileName,
  formatRecordSubtitle,
  formatViewerHeaderTitle,
  formatRecordTimestamp,
} from '../../../services/files/recordPresentation';
import { formatBytes } from '../../../services/files/filesShared';
import type { FilesScreenProps } from './navigationTypes';
import FileViewerHeader from '../../../components/files/FileViewerHeader';
import FileDetailsModal from '../../../components/files/FileDetailsModal';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FileViewerScreen({ route }: FilesScreenProps<'FileViewerScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { runWithAutoLockPaused } = useAppAuth();
  const { getToken } = useClerkAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const { fileId } = route.params;
  const insets = useSafeAreaInsets();
  const { documentTypes } = useDocumentTypes(patientId);

  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const mountedRef = useRef(true);

  // Single clean back handler across header button and Android hardware back
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

  // Hide bottom tab bar while viewing file to allow immersive full screen
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions?.({ tabBarStyle: { display: 'none' } });
    return () => {
      parent?.setOptions?.({ tabBarStyle: undefined });
    };
  }, [navigation]);

  const categoryLabel = useMemo(
    () =>
      formatRecordCategoryLabel(fileMetadata?.documentTypeId, documentTypes) ??
      formatRecordCategoryLabel(fileMetadata?.type, documentTypes) ??
      fileMetadata?.type ??
      null,
    [fileMetadata?.documentTypeId, fileMetadata?.type, documentTypes]
  );

  const viewerHeaderTitle = useMemo(() => {
    if (!fileMetadata && !preview) return 'Preview';
    return formatViewerHeaderTitle(fileMetadata ?? preview, null, { maxFileNameChars: 24 });
  }, [fileMetadata, preview]);

  const viewerHeaderSubtitle = useMemo(() => {
    return formatRecordSubtitle(fileMetadata) || undefined;
  }, [fileMetadata]);

  const loadFile = useCallback(() => {
    setIsRetrying(true);
    setError(null);
    Promise.all([
      preparePreviewFile(patientId, fileId, getTokenRef.current),
      getFileById(patientId, fileId),
    ])
      .then(([previewRes, fileRes]) => {
        if (!mountedRef.current) return;
        setPreview(previewRes);
        setFileMetadata(fileRes);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Unable to open file preview.');
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsRetrying(false);
        }
      });
  }, [fileId, patientId]);

  useEffect(() => {
    mountedRef.current = true;
    loadFile();

    return () => {
      mountedRef.current = false;
      cleanupPreviewCache(patientId, fileId).catch(() => {});
    };
  }, [fileId, loadFile, patientId]);

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const available = await Sharing.isAvailableAsync().catch(() => false);
      if (!available) {
        dialog.alert('No app available', 'This device cannot share files with other apps.');
        return;
      }
      const freshPreview = await preparePreviewFile(patientId, fileId, getTokenRef.current);
      await runWithAutoLockPaused(() =>
        Sharing.shareAsync(freshPreview.uri, {
          mimeType: freshPreview.mimeType,
          dialogTitle: formatRecordFileName(fileMetadata ?? freshPreview),
        })
      );
    } catch (err) {
      dialog.alert('Could not share file', err instanceof Error ? err.message : 'Unable to share this file.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleDownload = async () => {
    // On native mobile, Sharing.shareAsync with mimeType provides the OS "Save to Files" / "Download" action
    await handleShare();
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
      await deleteItem(patientId, fileId, getTokenRef.current);
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
      navigation.goBack();
    } catch (err) {
      dialog.alert('Could not delete', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleRename = async (newName: string) => {
    await renameFile(patientId, fileId, newName);
    const updated = await getFileById(patientId, fileId);
    setFileMetadata((prev: any) => updated ?? { ...prev, name: newName });
    mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 1. Unified Clinical Header Bar */}
      <FileViewerHeader
        title={viewerHeaderTitle}
        subtitle={viewerHeaderSubtitle}
        categoryLabel={categoryLabel}
        onBack={handleGoBack}
        onShare={handleShare}
      />

      {/* 2. Main Content Canvas */}
      <View style={styles.canvas}>
        {error ? (
          <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
            <View
              style={[
                styles.errorIconWrap,
                { backgroundColor: colors.emergencyBg, borderRadius: radii.full },
              ]}
            >
              <AppIcon name="alert" size={sizes.iconLg} color="emergency" />
            </View>
            <ThemedText variant="h3">Preview unavailable</ThemedText>
            <ThemedText variant="body" color="textMuted" style={styles.textCenter}>
              {error}
            </ThemedText>
            <Button
              label="Try again"
              variant="outline"
              loading={isRetrying}
              onPress={loadFile}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        ) : !preview ? (
          <View style={[styles.center, { gap: spacing.md }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <ThemedText variant="body" color="textMuted">
              Opening file preview...
            </ThemedText>
          </View>
        ) : preview.previewKind === 'image' ? (
          <ZoomableImage uri={preview.uri} />
        ) : preview.previewKind === 'pdf' ? (
          <Pdf
            source={{ uri: preview.uri }}
            style={[styles.pdf, { backgroundColor: colors.background }]}
            trustAllCerts={false}
          />
        ) : (
          <View style={[styles.center, { padding: spacing.xl }]}>
            <Card
              padding="lg"
              elevation="md"
              style={[styles.downloadCard, { gap: spacing.lg, maxWidth: sizes.dialogWidth }]}
            >
              <View
                style={[
                  styles.unsupportedIconBox,
                  { backgroundColor: colors.primaryLight, borderRadius: radii.xl },
                ]}
              >
                <AppIcon name="document" size={sizes.avatarLg - 16} color="primary" />
              </View>

              <View style={[styles.center, { gap: spacing.xs }]}>
                <ThemedText variant="h3" style={styles.textCenter} numberOfLines={2}>
                  {formatRecordFileName(fileMetadata ?? preview)}
                </ThemedText>
                <ThemedText variant="small" color="textMuted">
                  {preview.mimeType || 'Document'}
                </ThemedText>
              </View>

              <ThemedText variant="body" color="textSecondary" style={styles.textCenter}>
                This file cannot be previewed directly. Export or share it to open in an external application.
              </ThemedText>

              <Button
                label="Share or Open File"
                icon="share"
                variant="primary"
                fullWidth
                onPress={handleShare}
              />
            </Card>
          </View>
        )}
      </View>

      {/* 3. New Floating Clinical Action Pill */}
      {preview ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.floatingPillWrap,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <View
            pointerEvents="auto"
            style={[
              styles.floatingPill,
              shadows.lg,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
                borderRadius: radii.full,
              },
            ]}
          >
            {/* Full Screen Action */}
            <RNGHTouchableOpacity
              onPress={() => setIsFullScreen(true)}
              accessibilityRole="button"
              accessibilityLabel="Full screen preview"
              hitSlop={8}
              activeOpacity={0.7}
              style={[styles.pillBtn, { borderRadius: radii.full }]}
            >
              <AppIcon name="fullscreen" size={sizes.iconMd} color="text" />
            </RNGHTouchableOpacity>

            {/* Save / Export Action */}
            <RNGHTouchableOpacity
              onPress={handleDownload}
              accessibilityRole="button"
              accessibilityLabel="Save file to device"
              hitSlop={8}
              activeOpacity={0.7}
              style={[styles.pillBtn, { borderRadius: radii.full }]}
            >
              <AppIcon name="download" size={sizes.iconMd} color="text" />
            </RNGHTouchableOpacity>

            {/* Details & Rename Action */}
            <RNGHTouchableOpacity
              onPress={() => setDetailsModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="File details and rename"
              hitSlop={8}
              activeOpacity={0.7}
              style={[styles.pillBtn, { borderRadius: radii.full }]}
            >
              <AppIcon name="info" size={sizes.iconMd} color="text" />
            </RNGHTouchableOpacity>

            {/* Delete Action */}
            <RNGHTouchableOpacity
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete file"
              hitSlop={8}
              activeOpacity={0.7}
              style={[styles.pillBtn, { borderRadius: radii.full }]}
            >
              <AppIcon name="trash" size={sizes.iconMd} color="emergency" />
            </RNGHTouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* 4. Details & Rename Sheet Modal */}
      {fileMetadata || preview ? (
        <FileDetailsModal
          visible={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          fileName={formatRecordFileName(fileMetadata ?? preview)}
          category={categoryLabel}
          mimeType={preview?.mimeType || fileMetadata?.mimeType}
          sizeFormatted={fileMetadata?.sizeBytes ? formatBytes(fileMetadata.sizeBytes) : null}
          uploadedAtFormatted={
            fileMetadata?.createdAt
              ? formatRecordTimestamp(fileMetadata.createdAt)
              : fileMetadata?.documentDate
                ? formatRecordTimestamp(fileMetadata.documentDate)
                : null
          }
          onRename={handleRename}
        />
      ) : null}

      {/* 5. Full Screen Overlay Modal */}
      {preview ? (
        <Modal
          visible={isFullScreen}
          transparent={false}
          onRequestClose={() => setIsFullScreen(false)}
          animationType="fade"
        >
          <GestureHandlerRootView style={[styles.fullScreenOverlay, { backgroundColor: colors.overlay }]}>
            <View
              style={[
                styles.closeOverlayWrap,
                { top: Math.max(insets.top, spacing.lg) + spacing.sm, right: spacing.lg },
              ]}
            >
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
                <AppIcon name="close" size={sizes.iconLg} color="text" />
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
  },
  pdf: {
    flex: 1,
    width: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadCard: {
    width: '100%',
    alignItems: 'center',
  },
  unsupportedIconBox: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPillWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
    elevation: 20,
  },
  floatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 101,
    elevation: 25,
  },
  pillBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtnPressed: {
    opacity: 0.6,
  },
  fullScreenOverlay: {
    flex: 1,
  },
  closeOverlayWrap: {
    position: 'absolute',
    zIndex: 100,
  },
  closeOverlayBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
