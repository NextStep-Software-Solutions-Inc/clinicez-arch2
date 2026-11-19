import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Image, Modal, Pressable, Platform, ActivityIndicator } from 'react-native';
import { theme, subscribeActiveTheme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import type { PickedEvidenceFile } from '../../utils/directoryVerification';

function isImageType(contentType?: string | null, name?: string | null): boolean {
  if (contentType && contentType.toLowerCase().startsWith('image/')) return true;
  if (name && /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(name)) return true;
  return false;
}

function isPdfType(contentType?: string | null, name?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes('pdf')) return true;
  if (name && /\.pdf(\?.*)?$/i.test(name)) return true;
  return false;
}

function deriveFriendlyName(source?: string | null, fallback = 'Uploaded document'): string {
  if (!source) return fallback;
  const clean = source.split('?')[0];
  const segments = clean.split('/').filter(Boolean);
  return segments[segments.length - 1] || fallback;
}

export interface EvidenceProofPreviewProps {
  label: string;
  objectKey?: string | null;
  localFile?: PickedEvidenceFile | null;
  fetchBlob?: () => Promise<[Blob | null, { message?: string } | null]>;
  testID?: string;
}

export function EvidenceProofPreview({
  label,
  objectKey,
  localFile,
  fetchBlob,
  testID,
}: EvidenceProofPreviewProps) {
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => subscribeActiveTheme(() => setThemeTick((t) => t + 1)), []);
  const styles = useMemo(() => createStyles(), [themeTick]);

  const fetchBlobRef = useRef(fetchBlob);
  fetchBlobRef.current = fetchBlob;
  const hasFetcher = Boolean(fetchBlob);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(localFile?.mimeType ?? null);
  const [fileName, setFileName] = useState<string>(
    localFile?.name || deriveFriendlyName(objectKey, label),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadFromServer = useCallback(async () => {
    const fetcher = fetchBlobRef.current;
    if (!objectKey || !fetcher) return;
    setLoading(true);
    setError(null);
    try {
      const [blob, err] = await fetcher();
      if (err || !blob) {
        setError(err?.message || 'Unable to load uploaded document preview.');
        return;
      }
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      }
      setContentType(blob.type || null);
      setFileName(deriveFriendlyName(objectKey, label));
    } catch (err: any) {
      setError(err?.message || 'Unable to load uploaded document preview.');
    } finally {
      setLoading(false);
    }
  }, [objectKey, label]);

  useEffect(() => {
    if (localFile) {
      let nextUrl: string | null = localFile.uri || null;
      if (
        localFile.file &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        nextUrl = URL.createObjectURL(localFile.file);
      }
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:') && prev !== nextUrl) {
          URL.revokeObjectURL(prev);
        }
        return nextUrl;
      });
      setContentType(localFile.mimeType || null);
      setFileName(localFile.name || label);
      setLoading(false);
      setError(null);
      return;
    }

    if (objectKey && hasFetcher) {
      void loadFromServer();
    } else {
      setPreviewUrl(null);
      setLoading(false);
      setError(null);
    }
  }, [localFile, objectKey, hasFetcher, label, loadFromServer]);

  useEffect(() => {
    return () => {
      if (
        previewUrl &&
        previewUrl.startsWith('blob:') &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!objectKey && !localFile) {
    return null;
  }

  const isImage = isImageType(contentType, fileName || objectKey);
  const isPdf = !isImage && isPdfType(contentType, fileName || objectKey);
  const kindText = isPdf ? 'PDF Document' : isImage ? 'Image' : 'Document';

  const handleDownloadWeb = () => {
    if (Platform.OS !== 'web' || !previewUrl || typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.headerMeta}>
          <Icon name="file" size={16} color={theme.colors.primary} />
          <View style={styles.headerTextCol}>
            <ThemedText variant="captionBold" color={theme.colors.text} numberOfLines={1}>
              {fileName}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {kindText}
            </ThemedText>
          </View>
        </View>
        {previewUrl ? (
          <View style={styles.actionRow}>
            <Button
              title="Full View"
              variant="outline"
              size="sm"
              icon="maximize"
              onPress={() => setExpanded(true)}
              testID={testID ? `${testID}-expand` : undefined}
            />
            {Platform.OS === 'web' ? (
              <Button
                title="Download"
                variant="ghost"
                size="sm"
                icon="download"
                onPress={handleDownloadWeb}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Loading document preview...
          </ThemedText>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <View style={styles.errorTextRow}>
            <Icon name="alertCircle" size={16} color={theme.colors.warningText} />
            <ThemedText variant="caption" color={theme.colors.warningText} style={styles.flex1}>
              {error}
            </ThemedText>
          </View>
          {hasFetcher ? (
            <Button
              title="Retry"
              variant="outline"
              size="sm"
              icon="refresh"
              onPress={() => void loadFromServer()}
            />
          ) : null}
        </View>
      ) : previewUrl ? (
        isImage ? (
          <Pressable
            onPress={() => setExpanded(true)}
            style={styles.imageFrame}
            accessibilityLabel={`View ${label}`}
          >
            <Image
              source={{ uri: previewUrl }}
              style={styles.inlineImage}
              resizeMode="contain"
            />
          </Pressable>
        ) : isPdf && Platform.OS === 'web' ? (
          <View style={styles.pdfFrame}>
            {React.createElement('iframe', {
              src: previewUrl,
              title: label,
              style: {
                width: '100%',
                height: 220,
                border: 'none',
                display: 'block',
                backgroundColor: theme.colors.surface,
              },
            })}
          </View>
        ) : (
          <View style={styles.stateBox}>
            <Icon name="file" size={18} color={theme.colors.primary} />
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              {fileName} ready ({kindText}). Tap Full View to inspect.
            </ThemedText>
          </View>
        )
      ) : null}

      <Modal
        visible={expanded && Boolean(previewUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setExpanded(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headerTextCol}>
                <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1}>
                  {label}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                  {kindText} • {fileName}
                </ThemedText>
              </View>
              <View style={styles.actionRow}>
                {Platform.OS === 'web' && previewUrl ? (
                  <Button
                    title="Download"
                    variant="outline"
                    size="sm"
                    icon="download"
                    onPress={handleDownloadWeb}
                  />
                ) : null}
                <Button
                  title="Close"
                  variant="ghost"
                  size="sm"
                  icon="close"
                  onPress={() => setExpanded(false)}
                />
              </View>
            </View>

            <View style={styles.modalBody}>
              {previewUrl && isImage ? (
                <Image
                  source={{ uri: previewUrl }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              ) : previewUrl && Platform.OS === 'web' ? (
                React.createElement('iframe', {
                  src: previewUrl,
                  title: `${label} full document`,
                  style: {
                    width: '100%',
                    height: '100%',
                    minHeight: 480,
                    border: 'none',
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.surface,
                  },
                })
              ) : (
                <View style={styles.stateBox}>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Preview unavailable on this platform.
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      padding: 10,
      gap: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
    },
    headerMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 160,
    },
    headerTextCol: {
      flex: 1,
      minWidth: 0,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    stateBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 18,
      paddingHorizontal: 12,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: 10,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.warningBg,
      borderWidth: 1,
      borderColor: theme.colors.warningBorder,
    },
    errorTextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    flex1: {
      flex: 1,
    },
    imageFrame: {
      borderRadius: theme.radii.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineImage: {
      width: '100%',
      height: 180,
    },
    pdfFrame: {
      borderRadius: theme.radii.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    modalCard: {
      width: '100%',
      maxWidth: 960,
      maxHeight: '88%',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    modalBody: {
      padding: 16,
      minHeight: 360,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
    },
    fullImage: {
      width: '100%',
      height: 520,
    },
  });
