import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { mutate } from 'swr';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentTypes } from '../../../hooks/useDocumentTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRegisterWebHeaderOverride } from '../../../contexts/HeaderSearchContext';
import {
  preparePreviewFile,
  revokePreviewUri,
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
import FileDetailsModal from '../../../components/files/FileDetailsModal';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FileViewerScreenWeb({ route }: FilesScreenProps<'FileViewerScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { fileId } = route.params;
  const insets = useSafeAreaInsets();
  const { documentTypes } = useDocumentTypes(patientId);

  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeUriRef = useRef<string | null>(null);

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
    return formatViewerHeaderTitle(fileMetadata ?? preview, null, { maxFileNameChars: 24 });
  }, [fileMetadata, preview]);

  const viewerHeaderSubtitle = useMemo(() => {
    return formatRecordSubtitle(fileMetadata) || undefined;
  }, [fileMetadata]);

  useEffect(() => {
    if (viewerHeaderTitle) {
      navigation.setOptions({ title: viewerHeaderTitle });
    }
  }, [navigation, viewerHeaderTitle]);

  const loadFile = useCallback(() => {
    const reqId = ++requestIdRef.current;
    setIsRetrying(true);
    setError(null);
    Promise.all([
      preparePreviewFile(patientId, fileId, getTokenRef.current),
      getFileById(patientId, fileId),
    ])
      .then(([previewRes, fileRes]) => {
        if (!mountedRef.current || reqId !== requestIdRef.current) {
          revokePreviewUri(fileId, previewRes.uri);
          return;
        }
        if (activeUriRef.current && activeUriRef.current !== previewRes.uri) {
          revokePreviewUri(fileId, activeUriRef.current);
        }
        activeUriRef.current = previewRes.uri;
        setPreview(previewRes);
        setFileMetadata(fileRes);
      })
      .catch((err) => {
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Unable to decrypt or load this file.');
      })
      .finally(() => {
        if (mountedRef.current && reqId === requestIdRef.current) {
          setIsRetrying(false);
        }
      });
  }, [fileId, patientId]);

  useEffect(() => {
    mountedRef.current = true;
    loadFile();

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      if (activeUriRef.current) {
        revokePreviewUri(fileId, activeUriRef.current);
        activeUriRef.current = null;
      }
    };
  }, [fileId, loadFile]);

  const handleDownload = useCallback(async () => {
    try {
      const fresh = await preparePreviewFile(patientId, fileId, getTokenRef.current);
      const fileName = formatRecordFileName(fileMetadata ?? fresh);
      if (typeof document !== 'undefined') {
        const res = await fetch(fresh.uri);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
        }, 1000);
      } else {
        window.open(fresh.uri, '_blank');
      }
    } catch (err) {
      dialog.alert('Download failed', err instanceof Error ? err.message : 'Unable to download file.');
    }
  }, [fileId, fileMetadata, patientId]);

  const handleShare = useCallback(async () => {
    try {
      const fresh = await preparePreviewFile(patientId, fileId, getTokenRef.current);
      const fileName = formatRecordFileName(fileMetadata ?? fresh);

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          if (typeof fetch === 'function' && typeof File !== 'undefined' && typeof navigator.canShare === 'function') {
            try {
              const res = await fetch(fresh.uri);
              const blob = await res.blob();
              const file = new File([blob], fileName, { type: fresh.mimeType || blob.type || 'application/octet-stream' });
              if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                  title: fileName,
                  files: [file],
                });
                return;
              }
            } catch {
              // Fall back to url sharing
            }
          }

          await navigator.share({
            title: fileName,
            url: fresh.uri,
          });
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            await handleDownload();
          }
        }
      } else {
        await handleDownload();
      }
    } catch (err) {
      dialog.alert('Could not share file', err instanceof Error ? err.message : 'Unable to share this file.');
    }
  }, [fileId, fileMetadata, handleDownload, patientId]);

  useRegisterWebHeaderOverride(
    'FileViewerScreen',
    viewerHeaderTitle,
    viewerHeaderSubtitle,
    categoryLabel,
    handleShare
  );

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

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg }]}>
        <AppIcon name="alert" size={sizes.avatarMd} color="emergency" />
        <ThemedText variant="h3">Unable to open preview</ThemedText>
        <ThemedText variant="body" color="textMuted" style={[styles.textCenter, { maxWidth: 500 }]}>
          {error}
        </ThemedText>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
          <Button label="Try again" variant="outline" loading={isRetrying} onPress={loadFile} />
        </View>
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, gap: spacing.md }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText variant="body" color="textMuted">
          Decrypting preview...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.viewer, { backgroundColor: colors.background }]}>
      {/* 1. Preview Surface */}
      <View style={styles.previewSurface}>
        {preview.previewKind === 'image' ? (
          <View style={styles.mediaContainer}>
            {React.createElement('img', {
              src: preview.uri,
              alt: formatRecordFileName(fileMetadata ?? preview),
              style: {
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: radii.md,
              },
            })}
          </View>
        ) : preview.previewKind === 'pdf' ? (
          <View style={styles.mediaContainer}>
            {React.createElement('iframe', {
              src: preview.uri,
              title: formatRecordFileName(fileMetadata ?? preview),
              style: {
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: colors.card,
                borderRadius: radii.md,
              },
            })}
          </View>
        ) : (
          <View style={[styles.center, { padding: spacing.xl }]}>
            <Card
              padding="lg"
              elevation="md"
              style={[styles.downloadCard, { gap: spacing.lg, maxWidth: sizes.dialogWidth }]}
            >
              <View
                style={[
                  styles.downloadIconWrap,
                  {
                    width: sizes.avatarLg,
                    height: sizes.avatarLg,
                    borderRadius: radii.xl,
                    backgroundColor: colors.primaryLight,
                  },
                ]}
              >
                <AppIcon name="document" size={sizes.iconXl} color="primary" />
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
                This document cannot be previewed inline. Download it to open with your local application.
              </ThemedText>

              <Button
                label="Download File"
                icon="download"
                variant="primary"
                fullWidth
                onPress={handleDownload}
              />
            </Card>
          </View>
        )}
      </View>

      {/* 2. Floating Clinical Action Pill */}
      <View
        pointerEvents="box-none"
        style={[
          styles.floatingPillWrap,
          { paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}
      >
        <View
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
          <Pressable
            onPress={() => setIsFullScreen(true)}
            accessibilityRole="button"
            accessibilityLabel="Full screen preview"
            hitSlop={8}
            style={({ pressed }) => [styles.pillBtn, pressed && styles.pillBtnPressed]}
          >
            <AppIcon name="fullscreen" size={sizes.iconMd} color="text" />
            <ThemedText variant="captionBold" color="text">
              Full Screen
            </ThemedText>
          </Pressable>

          {/* Download / Save Action */}
          <Pressable
            onPress={handleDownload}
            accessibilityRole="button"
            accessibilityLabel="Download file"
            hitSlop={8}
            style={({ pressed }) => [styles.pillBtn, pressed && styles.pillBtnPressed]}
          >
            <AppIcon name="download" size={sizes.iconMd} color="text" />
            <ThemedText variant="captionBold" color="text">
              Save
            </ThemedText>
          </Pressable>

          {/* Details Action */}
          <Pressable
            onPress={() => setDetailsModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="File details and rename"
            hitSlop={8}
            style={({ pressed }) => [styles.pillBtn, pressed && styles.pillBtnPressed]}
          >
            <AppIcon name="info" size={sizes.iconMd} color="text" />
            <ThemedText variant="captionBold" color="text">
              Details
            </ThemedText>
          </Pressable>

          {/* Delete Action */}
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete file"
            hitSlop={8}
            style={({ pressed }) => [styles.pillBtn, pressed && styles.pillBtnPressed]}
          >
            <AppIcon name="trash" size={sizes.iconMd} color="emergency" />
            <ThemedText variant="captionBold" color="emergency">
              Delete
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* 3. Full Screen Modal */}
      <Modal
        visible={isFullScreen}
        transparent={false}
        onRequestClose={() => setIsFullScreen(false)}
        animationType="fade"
      >
        <View style={[styles.flex, { backgroundColor: colors.overlay }]}>
          <View style={[styles.closeOverlayBtnWrap, { top: spacing.lg, right: spacing.lg }]}>
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

          <View style={styles.fullScreenContent}>
            {preview.previewKind === 'image' ? (
              React.createElement('img', {
                src: preview.uri,
                alt: formatRecordFileName(fileMetadata ?? preview),
                style: {
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                },
              })
            ) : preview.previewKind === 'pdf' ? (
              React.createElement('iframe', {
                src: preview.uri,
                title: formatRecordFileName(fileMetadata ?? preview),
                style: {
                  width: '100%',
                  height: '100%',
                  border: 'none',
                },
              })
            ) : null}
          </View>
        </View>
      </Modal>

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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewer: {
    flex: 1,
    position: 'relative',
  },
  previewSurface: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  mediaContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  downloadCard: {
    width: '100%',
    alignItems: 'center',
  },
  downloadIconWrap: {
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
    zIndex: 30,
  },
  floatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 64,
    minHeight: 48,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillBtnPressed: {
    opacity: 0.6,
  },
  closeOverlayBtnWrap: {
    position: 'absolute',
    zIndex: 100,
  },
  closeOverlayBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
