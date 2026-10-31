import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentTypes } from '../../../hooks/useDocumentTypes';
import { useContentInsets } from '../../../hooks/useContentInsets';
import { useRegisterWebHeaderOverride } from '../../../contexts/HeaderSearchContext';
import { preparePreviewFile, revokePreviewUri, getFileById, deleteItem, renameFile } from '../../../services/files';
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

export default function FileViewerScreenWeb({ route }: FilesScreenProps<'FileViewerScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { fileId } = route.params;
  const contentInsets = useContentInsets();
  const { documentTypes } = useDocumentTypes(patientId);

  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
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
    return formatViewerHeaderTitle(fileMetadata ?? preview, categoryLabel);
  }, [fileMetadata, preview, categoryLabel]);

  const viewerHeaderSubtitle = useMemo(() => {
    return formatRecordSubtitle(fileMetadata) || undefined;
  }, [fileMetadata]);

  useRegisterWebHeaderOverride('FileViewerScreen', viewerHeaderTitle, viewerHeaderSubtitle);

  useEffect(() => {
    if (viewerHeaderTitle) {
      navigation.setOptions({ title: viewerHeaderTitle });
    }
  }, [navigation, viewerHeaderTitle]);

  useEffect(() => {
    // Hide bottom tab bar while viewing file to allow full immersion
    navigation.getParent()?.setOptions({
      tabBarStyle: { display: 'none' },
    });
    return () => {
      navigation.getParent()?.setOptions({
        tabBarStyle: undefined,
      });
    };
  }, [navigation]);

  const loadFile = useCallback(() => {
    const reqId = ++requestIdRef.current;
    setIsRetrying(true);
    setError(null);
    Promise.all([
      preparePreviewFile(patientId, fileId, getToken),
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
  }, [fileId, getToken, patientId]);

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

  const handleDownload = () => {
    if (!preview) return;
    try {
      if (typeof document !== 'undefined') {
        const link = document.createElement('a');
        link.href = preview.uri;
        link.download = formatRecordFileName(fileMetadata ?? preview);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        window.open(preview.uri, '_blank');
      }
    } catch (err) {
      dialog.alert('Download failed', err instanceof Error ? err.message : 'Unable to download file.');
    }
  };

  const handleShare = async () => {
    if (!preview) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: formatRecordFileName(fileMetadata ?? preview),
          url: preview.uri,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleDownload();
        }
      }
    } else {
      handleDownload();
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

  const isShareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <View style={[styles.viewer, { backgroundColor: colors.background }]}>
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

      {/* Floating Action Toolbar */}
      <View
        style={[
          styles.floatingToolbarWrap,
          { paddingBottom: Math.max(contentInsets.bottom, spacing.md) + spacing.xs },
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
            <AppIcon name="fullscreen" size={sizes.iconMd} color="text" />
            <ThemedText variant="captionBold" color="text">
              Full Screen
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={isShareSupported ? handleShare : handleDownload}
            accessibilityRole="button"
            accessibilityLabel={isShareSupported ? 'Share' : 'Download'}
            style={({ pressed }) => [styles.toolbarBtn, pressed && styles.toolbarBtnPressed]}
          >
            <AppIcon name={isShareSupported ? 'share' : 'download'} size={sizes.iconMd} color="text" />
            <ThemedText variant="captionBold" color="text">
              {isShareSupported ? 'Share' : 'Download'}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setRenameModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Rename"
            style={({ pressed }) => [styles.toolbarBtn, pressed && styles.toolbarBtnPressed]}
          >
            <AppIcon name="edit" size={sizes.iconMd} color="text" />
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
            <AppIcon name="trash" size={sizes.iconMd} color="emergency" />
            <ThemedText variant="captionBold" color="emergency">
              Delete
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Full Screen Modal */}
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 88,
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
  floatingToolbarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
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
