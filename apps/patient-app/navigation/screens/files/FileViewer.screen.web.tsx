import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { preparePreviewFile, revokePreviewUri, getFileById, deleteItem, renameFile } from '../../../services/files';
import type { PreparedPreviewFile } from '../../../services/files';
import { formatRecordCategoryLabel } from '../../../services/files/documentTypeMapping';
import type { FilesScreenProps } from './navigationTypes';
import RenameModal from '../../../components/ui/RenameModal';
import Badge from '../../../components/ui/Badge';
import { ProvenanceBadge } from '../../../components/records/ProvenanceBadge';
import { ClinicalUrgencyBadge } from '../../../components/records/ClinicalUrgencyBadge';
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
        navigation.setOptions({ title: fileRes?.name || previewRes.name });
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
  }, [fileId, getToken, navigation, patientId]);

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
        link.download = preview.name;
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
          title: preview.name,
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
  const categoryBadgeLabel =
    formatRecordCategoryLabel(fileMetadata?.documentTypeId, documentTypes) ??
    formatRecordCategoryLabel(fileMetadata?.type, documentTypes) ??
    fileMetadata?.type ??
    null;

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
            {categoryBadgeLabel ? (
              <Badge label={categoryBadgeLabel} tone="neutral" size="sm" />
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
          <View style={styles.mediaContainer}>
            {React.createElement('img', {
              src: preview.uri,
              alt: preview.name,
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
              title: preview.name,
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
                  {preview.name}
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
          { paddingBottom: contentInsets.bottom + spacing.md },
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
              gap: spacing.sm,
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
            <AppIcon name="externalLink" size={sizes.iconMd} color="text" />
            <ThemedText variant="captionBold" color="text">
              Full Screen
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={isShareSupported ? handleShare : handleDownload}
            accessibilityRole="button"
            accessibilityLabel={isShareSupported ? 'Share' : 'Download'}
            style={styles.toolbarBtn}
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
            style={styles.toolbarBtn}
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
            style={styles.toolbarBtn}
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
                alt: preview.name,
                style: {
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                },
              })
            ) : preview.previewKind === 'pdf' ? (
              React.createElement('iframe', {
                src: preview.uri,
                title: preview.name,
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

      {renameModalOpen && fileMetadata && (
        <RenameModal
          visible={renameModalOpen}
          initialName={fileMetadata?.name || preview.name}
          onClose={() => setRenameModalOpen(false)}
          onSave={handleRename}
        />
      )}
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
  floatingToolbarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  floatingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 440,
  },
  toolbarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 54,
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
