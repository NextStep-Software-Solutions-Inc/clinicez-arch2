import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ReactNative from 'react-native';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createShadows,
  fontSizeScale,
  isLiveWebDom,
  lightColors,
  radiusScale,
  sizes,
  spaceScale,
} from '@clinicez/design-tokens';
import type {
  AttachmentPreviewData,
  AttachmentPreviewKind,
  AttachmentPreviewModalProps,
} from './types';

type ResolvedCommsColors = Record<keyof typeof lightColors, string>;

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif)(\?.*)?$/i;
const PDF_EXTENSION_PATTERN = /\.pdf(\?.*)?$/i;
const DEFERRED_TAB_REVOKE_MS = 5 * 60_000;

export function isPreviewableImage(mimeType?: string | null, fileName?: string | null): boolean {
  const normalizedMime = (mimeType || '').trim().toLowerCase();
  if (normalizedMime.startsWith('image/')) {
    return true;
  }
  return Boolean(fileName && IMAGE_EXTENSION_PATTERN.test(fileName.trim()));
}

export function isPreviewablePdf(mimeType?: string | null, fileName?: string | null): boolean {
  const normalizedMime = (mimeType || '').trim().toLowerCase();
  if (normalizedMime === 'application/pdf' || normalizedMime.includes('pdf')) {
    return true;
  }
  return Boolean(fileName && PDF_EXTENSION_PATTERN.test(fileName.trim()));
}

export function getAttachmentPreviewKind(
  mimeType?: string | null,
  fileName?: string | null,
): AttachmentPreviewKind {
  if (isPreviewableImage(mimeType, fileName)) {
    return 'image';
  }
  if (isPreviewablePdf(mimeType, fileName)) {
    return 'pdf';
  }
  return 'other';
}

export function formatAttachmentPreviewSize(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function revokePreviewResource(data: AttachmentPreviewData | null | undefined, defer = false): void {
  if (!data) return;

  const performRevoke = () => {
    try {
      if (typeof data.revoke === 'function') {
        data.revoke();
        return;
      }
      if (
        data.uri &&
        data.uri.startsWith('blob:') &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(data.uri);
      }
    } catch {
      // Ignore cleanup errors on already-revoked object URLs
    }
  };

  if (defer) {
    setTimeout(performRevoke, DEFERRED_TAB_REVOKE_MS);
  } else {
    performRevoke();
  }
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  visible,
  attachment,
  onClose,
  loadPreview,
  preview: controlledPreview,
  isLoading: controlledIsLoading,
  error: controlledError,
  onDownload,
  onOpenInNewTab,
  renderNativePdf,
  colors,
  shadows: shadowsProp,
  testID = 'attachment-preview-modal',
}) => {
  const colorsKey = colors
    ? `${colors.primary ?? ''}|${colors.primaryLight ?? ''}|${colors.primarySubtle ?? ''}|${colors.primaryBorder ?? ''}|${colors.primaryDark ?? ''}|${colors.primaryText ?? ''}|${colors.background ?? ''}|${colors.surface ?? ''}|${colors.surfaceSubtle ?? ''}|${colors.border ?? ''}|${colors.text ?? ''}|${colors.textSecondary ?? ''}|${colors.textMuted ?? ''}|${colors.overlay ?? ''}`
    : '';
  const c = useMemo<ResolvedCommsColors>(() => ({ ...lightColors, ...colors }), [colors, colorsKey]);
  const s = useMemo(
    () => ({ ...createShadows(c, isLiveWebDom), ...(shadowsProp ?? {}) }),
    [c, shadowsProp],
  );
  const styles = useMemo(() => createStyles(c, s), [c, s]);

  const isControlled = controlledPreview !== undefined;
  const platformOs = (ReactNative as { Platform?: { OS?: string } }).Platform?.OS;
  const isWeb = isLiveWebDom || platformOs === 'web' || platformOs === undefined;
  const RNImage = (ReactNative as { Image?: React.ComponentType<any> }).Image;

  const [loadedPreview, setLoadedPreview] = useState<AttachmentPreviewData | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  const loadPreviewRef = useRef(loadPreview);
  loadPreviewRef.current = loadPreview;
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const activePreviewRef = useRef<AttachmentPreviewData | null>(null);
  const deferredRevokeRef = useRef(false);

  const attachmentIdentity = attachment
    ? `${attachment.attachmentId ?? ''}|${attachment.fileKey}|${attachment.fileName}`
    : '';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      if (activePreviewRef.current) {
        revokePreviewResource(activePreviewRef.current, deferredRevokeRef.current);
        activePreviewRef.current = null;
        deferredRevokeRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    if (isControlled) {
      return;
    }

    if (!visible || !attachment) {
      requestIdRef.current += 1;
      if (activePreviewRef.current) {
        revokePreviewResource(activePreviewRef.current, deferredRevokeRef.current);
        activePreviewRef.current = null;
        deferredRevokeRef.current = false;
      }
      setLoadedPreview(null);
      setInternalLoading(false);
      setInternalError(null);
      return;
    }

    const loader = loadPreviewRef.current;
    if (!loader) {
      if (attachment.previewUrl) {
        const directData: AttachmentPreviewData = {
          uri: attachment.previewUrl,
          mimeType: attachment.contentType || 'application/octet-stream',
          fileName: attachment.fileName,
          sizeBytes: attachment.sizeBytes,
        };
        activePreviewRef.current = directData;
        setLoadedPreview(directData);
        setInternalLoading(false);
        setInternalError(null);
      } else {
        setInternalLoading(false);
        setInternalError('Unable to load attachment preview.');
      }
      return;
    }

    const reqId = ++requestIdRef.current;
    if (activePreviewRef.current) {
      revokePreviewResource(activePreviewRef.current, deferredRevokeRef.current);
      activePreviewRef.current = null;
      deferredRevokeRef.current = false;
    }
    setLoadedPreview(null);
    setInternalLoading(true);
    setInternalError(null);

    void loader(attachment)
      .then((result) => {
        if (!mountedRef.current || reqId !== requestIdRef.current) {
          revokePreviewResource(result, false);
          return;
        }
        activePreviewRef.current = result;
        deferredRevokeRef.current = false;
        setLoadedPreview(result);
        setInternalError(null);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || reqId !== requestIdRef.current) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Unable to load attachment preview.';
        setInternalError(message);
      })
      .finally(() => {
        if (mountedRef.current && reqId === requestIdRef.current) {
          setInternalLoading(false);
        }
      });
  }, [isControlled, visible, attachment, attachmentIdentity, reloadCounter]);

  useEffect(() => {
    if (!visible || !isLiveWebDom || typeof window === 'undefined') {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  const activePreview = isControlled ? controlledPreview ?? null : loadedPreview;
  const isLoading = isControlled ? Boolean(controlledIsLoading) : internalLoading;
  const error = isControlled ? controlledError ?? null : internalError;

  const displayFileName = activePreview?.fileName || attachment?.fileName || 'Attachment';
  const displayMimeType = activePreview?.mimeType || attachment?.contentType || 'application/octet-stream';
  const displaySize = formatAttachmentPreviewSize(activePreview?.sizeBytes ?? attachment?.sizeBytes);
  const previewKind = getAttachmentPreviewKind(displayMimeType, displayFileName);
  const kindLabel =
    previewKind === 'pdf' ? 'PDF Document' : previewKind === 'image' ? 'Image' : 'File';
  const subtitleText = displaySize ? `${kindLabel} • ${displaySize}` : kindLabel;

  const handleRetry = useCallback(() => {
    setReloadCounter((count) => count + 1);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!attachment || !activePreview) return;
    if (onDownload) {
      await onDownload(attachment, activePreview);
      return;
    }
    if (typeof document !== 'undefined' && activePreview.uri) {
      const anchor = document.createElement('a');
      anchor.href = activePreview.uri;
      anchor.download = displayFileName || 'attachment';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  }, [attachment, activePreview, displayFileName, onDownload]);

  const handleOpenInNewTab = useCallback(async () => {
    if (!attachment || !activePreview) return;
    if (onOpenInNewTab) {
      await onOpenInNewTab(attachment, activePreview);
      return;
    }
    if (typeof window !== 'undefined' && activePreview.uri) {
      if (
        activePreview.blob &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        const tabUrl = URL.createObjectURL(activePreview.blob);
        window.open(tabUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => {
          if (typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(tabUrl);
          }
        }, DEFERRED_TAB_REVOKE_MS);
        return;
      }

      if (activePreview.uri.startsWith('blob:')) {
        deferredRevokeRef.current = true;
      }
      window.open(activePreview.uri, '_blank', 'noopener,noreferrer');
    }
  }, [attachment, activePreview, onOpenInNewTab]);

  if (!visible || !attachment) {
    return null;
  }

  const canShowActions = Boolean(activePreview && !isLoading && !error);
  const showOpenInNewTab = Boolean(canShowActions && (isWeb || onOpenInNewTab));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.overlay} testID={`${testID}-overlay`}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss attachment preview"
        />

        <View style={styles.card} testID={`${testID}-card`}>
          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {displayFileName}
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {subtitleText}
              </Text>
            </View>

            <View style={styles.headerActions}>
              {canShowActions && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    void handleDownload();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Download ${displayFileName}`}
                  testID={`${testID}-download-btn`}
                >
                  <Text style={styles.actionButtonText}>Download</Text>
                </TouchableOpacity>
              )}

              {showOpenInNewTab && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    void handleOpenInNewTab();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${displayFileName} in new tab`}
                  testID={`${testID}-open-tab-btn`}
                >
                  <Text style={styles.actionButtonText}>Open in New Tab</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close attachment preview"
                testID={`${testID}-close-btn`}
              >
                <View style={styles.closeGlyphBox}>
                  <View style={[styles.closeGlyphBar, { transform: [{ rotate: '45deg' }] }]} />
                  <View style={[styles.closeGlyphBar, { transform: [{ rotate: '-45deg' }] }]} />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Modal Body */}
          <View style={styles.body}>
            {isLoading ? (
              <View style={styles.stateContainer} testID={`${testID}-loading`}>
                <ActivityIndicator size="large" color={c.primary} />
                <Text style={styles.stateText}>Loading attachment preview...</Text>
              </View>
            ) : error ? (
              <View style={styles.stateContainer} testID={`${testID}-error`}>
                <Text style={styles.errorTitle}>Unable to Preview Attachment</Text>
                <Text style={styles.errorSubtitle}>{error}</Text>
                {!isControlled && Boolean(loadPreview) && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleRetry}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading attachment preview"
                    testID={`${testID}-retry-btn`}
                  >
                    <Text style={styles.primaryButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : activePreview ? (
              previewKind === 'image' ? (
                <View style={styles.mediaFrame} testID={`${testID}-image-container`}>
                  {isLiveWebDom || !RNImage ? (
                    React.createElement('img', {
                      src: activePreview.uri,
                      alt: displayFileName,
                      style: {
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        borderRadius: radiusScale.md,
                        display: 'block',
                      },
                    })
                  ) : (
                    <RNImage
                      source={{ uri: activePreview.uri }}
                      style={styles.previewImage}
                      resizeMode="contain"
                      accessibilityLabel={displayFileName}
                    />
                  )}
                </View>
              ) : previewKind === 'pdf' && isWeb ? (
                <View style={styles.pdfFrame} testID={`${testID}-pdf-container`}>
                  {React.createElement('iframe', {
                    src: activePreview.uri,
                    title: displayFileName,
                    style: {
                      width: '100%',
                      height: '100%',
                      minHeight: 480,
                      border: 'none',
                      borderRadius: radiusScale.md,
                      backgroundColor: c.surface,
                      display: 'block',
                    },
                  })}
                </View>
              ) : previewKind === 'pdf' && renderNativePdf ? (
                <View style={styles.pdfFrame} testID={`${testID}-native-pdf-container`}>
                  {renderNativePdf(activePreview.uri, displayFileName)}
                </View>
              ) : (
                <View style={styles.stateContainer} testID={`${testID}-fallback`}>
                  <Text style={styles.fallbackTitle}>{displayFileName}</Text>
                  <Text style={styles.stateText}>
                    {previewKind === 'pdf'
                      ? 'Use Download to open this PDF with your device viewer.'
                      : 'Inline preview is not available for this file type.'}
                  </Text>
                  <View style={styles.fallbackActions}>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => {
                        void handleDownload();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Download ${displayFileName}`}
                    >
                      <Text style={styles.primaryButtonText}>Download File</Text>
                    </TouchableOpacity>
                    {showOpenInNewTab && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => {
                          void handleOpenInNewTab();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${displayFileName} in new tab`}
                      >
                        <Text style={styles.actionButtonText}>Open in New Tab</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

function createStyles(
  c: ResolvedCommsColors,
  s: ReturnType<typeof createShadows>,
) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spaceScale.md,
      zIndex: 10500,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    card: {
      width: '100%',
      maxWidth: 960,
      height: '88%',
      maxHeight: '92%',
      backgroundColor: c.surface,
      borderRadius: radiusScale.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      flexDirection: 'column',
      ...s.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spaceScale.sm,
      paddingHorizontal: spaceScale.md,
      paddingVertical: spaceScale.sm,
      backgroundColor: c.surfaceSubtle,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerInfo: {
      flex: 1,
      minWidth: 160,
    },
    headerTitle: {
      fontSize: fontSizeScale.sm,
      fontWeight: '600',
      color: c.text,
    },
    headerSubtitle: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spaceScale.xs,
    },
    actionButton: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      borderRadius: radiusScale.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.text,
    },
    primaryButton: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.lg,
      borderRadius: radiusScale.sm,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...s.brandSm,
    },
    primaryButtonText: {
      fontSize: fontSizeScale.sm,
      fontWeight: '600',
      color: c.onPrimary,
    },
    closeButton: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      minWidth: sizes.touchTarget,
      minHeight: sizes.touchTarget,
      borderRadius: radiusScale.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeGlyphBox: {
      width: 14,
      height: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeGlyphBar: {
      position: 'absolute',
      width: 14,
      height: 2,
      backgroundColor: c.textSecondary,
      borderRadius: radiusScale.xs,
    },
    body: {
      flex: 1,
      backgroundColor: c.background,
      padding: spaceScale.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaFrame: {
      flex: 1,
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    pdfFrame: {
      flex: 1,
      width: '100%',
      height: '100%',
      borderRadius: radiusScale.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    stateContainer: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spaceScale.xl,
      gap: spaceScale.md,
    },
    stateText: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
      textAlign: 'center',
    },
    fallbackTitle: {
      fontSize: fontSizeScale.md,
      fontWeight: '600',
      color: c.text,
      textAlign: 'center',
    },
    fallbackActions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spaceScale.sm,
    },
    errorTitle: {
      fontSize: fontSizeScale.md,
      fontWeight: '600',
      color: c.emergencyText,
      textAlign: 'center',
    },
    errorSubtitle: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
      textAlign: 'center',
      maxWidth: 420,
    },
  });
}
