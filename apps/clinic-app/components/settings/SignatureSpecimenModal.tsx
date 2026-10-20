import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import * as ReactNative from 'react-native';

const PanResponder = (ReactNative as any).PanResponder || {
  create: (config: any) => ({
    panHandlers: {},
    ...config,
  }),
};
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';
import { SignatureMode } from '../../services/clinicService';

export interface ValidateSignatureAssetResult {
  valid: boolean;
  error: string | null;
}

export function validateSignatureAsset(asset: {
  name?: string;
  mimeType?: string;
  size?: number;
}): ValidateSignatureAssetResult {
  const isPng =
    asset.mimeType === 'image/png' ||
    Boolean(asset.name && asset.name.toLowerCase().endsWith('.png'));

  if (!isPng) {
    return {
      valid: false,
      error: 'Only transparent PNG signature specimens are supported.',
    };
  }

  // Max 500KB (500,000 bytes)
  if (asset.size && asset.size > 500000) {
    return {
      valid: false,
      error: 'Signature specimen image must not exceed 500KB.',
    };
  }

  return { valid: true, error: null };
}

export async function pickSignatureSpecimen(): Promise<{ dataUri?: string; error?: string } | null> {
  try {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/png'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const validation = validateSignatureAsset({
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    });

    if (!validation.valid) {
      return { error: validation.error || 'Invalid signature file.' };
    }

    if ((asset as any).file && typeof FileReader !== 'undefined') {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read signature image file.'));
        reader.readAsDataURL((asset as any).file);
      });
      return { dataUri };
    }

    if (Platform.OS === 'web' && asset.uri) {
      if (asset.uri.startsWith('data:')) {
        return { dataUri: asset.uri };
      }
      try {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to convert signature blob to data URI.'));
          reader.readAsDataURL(blob);
        });
        return { dataUri };
      } catch {
        return { dataUri: asset.uri };
      }
    }

    try {
      const FileSystem = await import('expo-file-system');
      if (FileSystem && FileSystem.readAsStringAsync) {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return { dataUri: `data:image/png;base64,${base64}` };
      }
    } catch {
      // Fallback
    }

    return { dataUri: asset.uri };
  } catch (err: any) {
    return { error: err?.message || 'Failed to select signature file.' };
  }
}

export interface Point {
  x: number;
  y: number;
}

export function strokesToPngDataUri(
  strokes: Point[][],
  width = 380,
  height = 140,
  strokeColor = theme.colors.text
): string {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const stroke of strokes) {
        if (stroke.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.stroke();
      }

      return canvas.toDataURL('image/png');
    }
  }

  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC';
}

export function strokeToSvgPath(points: Point[]): string {
  if (!points || points.length === 0) return '';
  return points
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`)
    .join(' ');
}

export interface SignatureSpecimenModalProps {
  visible: boolean;
  onClose: () => void;
  initialSignature?: string | null;
  initialMode?: SignatureMode;
  doctorName?: string;
  credentials?: {
    specialty?: string;
    prc?: string;
    ptr?: string;
    s2?: string;
    pan?: string;
  };
  onSave: (signatureSpecimen: string | null, mode: SignatureMode) => Promise<void> | void;
}

const PAD_WIDTH = 380;
const PAD_HEIGHT = 140;

export default function SignatureSpecimenModal({
  visible,
  onClose,
  initialSignature,
  initialMode = 'ESignatureSpecimen',
  doctorName = 'Dr. Attending Physician, MD',
  credentials,
  onSave,
}: SignatureSpecimenModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'draw'>('upload');
  const [signatureDataUri, setSignatureDataUri] = useState<string | null>(initialSignature || null);
  const [selectedMode, setSelectedMode] = useState<SignatureMode>(initialMode);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Drawing state
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const isDrawingRef = useRef(false);
  const padRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setSignatureDataUri(initialSignature || null);
      setSelectedMode(initialMode || 'ESignatureSpecimen');
      setUploadError(null);
      setStrokes([]);
      setCurrentStroke([]);
    }
  }, [visible, initialSignature, initialMode]);

  const handlePickFile = async () => {
    setUploadError(null);
    setUploading(true);
    try {
      const res = await pickSignatureSpecimen();
      if (!res) {
        setUploading(false);
        return;
      }
      if (res.error) {
        setUploadError(res.error);
        setUploading(false);
        return;
      }
      if (res.dataUri) {
        setSignatureDataUri(res.dataUri);
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to select signature image.');
    } finally {
      setUploading(false);
    }
  };

  const handleUndoStroke = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        setSignatureDataUri(null);
      } else {
        const uri = strokesToPngDataUri(next, PAD_WIDTH, PAD_HEIGHT, theme.colors.text);
        setSignatureDataUri(uri);
      }
      return next;
    });
  };

  const handleClearStrokes = () => {
    setStrokes([]);
    setCurrentStroke([]);
    setSignatureDataUri(null);
  };

  const handleApplyDrawing = () => {
    if (strokes.length === 0 && currentStroke.length === 0) {
      return;
    }
    const allStrokes = currentStroke.length > 0 ? [...strokes, currentStroke] : strokes;
    const uri = strokesToPngDataUri(allStrokes, PAD_WIDTH, PAD_HEIGHT, theme.colors.text);
    setSignatureDataUri(uri);
  };

  // PanResponder for mobile & fallback touch
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: any) => {
        isDrawingRef.current = true;
        const { locationX, locationY } = evt.nativeEvent;
        const pt: Point = { x: locationX, y: locationY };
        setCurrentStroke([pt]);
      },
      onPanResponderMove: (evt: any) => {
        if (!isDrawingRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const pt: Point = { x: locationX, y: locationY };
        setCurrentStroke((prev) => [...prev, pt]);
      },
      onPanResponderRelease: () => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        setCurrentStroke((curr) => {
          if (curr.length > 0) {
            setStrokes((prev) => {
              const next = [...prev, curr];
              const uri = strokesToPngDataUri(next, PAD_WIDTH, PAD_HEIGHT, theme.colors.text);
              setSignatureDataUri(uri);
              return next;
            });
          }
          return [];
        });
      },
    })
  ).current;

  // Web mouse handlers
  const handleMouseDown = (e: any) => {
    if (Platform.OS !== 'web') return;
    isDrawingRef.current = true;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    const x = rect ? e.clientX - rect.left : e.nativeEvent?.locationX || 0;
    const y = rect ? e.clientY - rect.top : e.nativeEvent?.locationY || 0;
    setCurrentStroke([{ x, y }]);
  };

  const handleMouseMove = (e: any) => {
    if (Platform.OS !== 'web' || !isDrawingRef.current) return;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    const x = rect ? e.clientX - rect.left : e.nativeEvent?.locationX || 0;
    const y = rect ? e.clientY - rect.top : e.nativeEvent?.locationY || 0;
    setCurrentStroke((prev) => [...prev, { x, y }]);
  };

  const handleMouseUp = () => {
    if (Platform.OS !== 'web' || !isDrawingRef.current) return;
    isDrawingRef.current = false;
    setCurrentStroke((curr) => {
      if (curr.length > 0) {
        setStrokes((prev) => {
          const next = [...prev, curr];
          const uri = strokesToPngDataUri(next, PAD_WIDTH, PAD_HEIGHT, theme.colors.text);
          setSignatureDataUri(uri);
          return next;
        });
      }
      return [];
    });
  };

  const handleSaveModal = async () => {
    setSaving(true);
    try {
      const finalSignature = selectedMode === 'WetSignature' ? null : signatureDataUri;
      await onSave(finalSignature, selectedMode);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSignature = () => {
    setSignatureDataUri(null);
    setStrokes([]);
    setCurrentStroke([]);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Clinician E-Signature Specimen"
      subtitle="Configure your official signature specimen and default signing mode for clinical documents"
      maxWidth={580}
      footer={
        <View style={styles.modalFooter}>
          {signatureDataUri ? (
            <Button
              title="Remove Signature"
              variant="danger"
              size="sm"
              onPress={handleRemoveSignature}
              disabled={saving}
            />
          ) : (
            <View style={styles.flex1} />
          )}
          <View style={styles.actionButtonsRow}>
            <Button title="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
            <Button
              title="Apply & Save"
              variant="primary"
              onPress={handleSaveModal}
              loading={saving}
            />
          </View>
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        {/* Mode Selector */}
        <View style={styles.section}>
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Default Document Signing Mode
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.helperText}>
            Select how your name and authorization appear on electronic prescriptions, medical certificates, and diagnostic requests.
          </ThemedText>

          <View style={styles.modeCardsRow}>
            <Pressable
              style={[
                styles.modeCard,
                selectedMode === 'ESignatureSpecimen' && styles.modeCardActive,
              ]}
              onPress={() => setSelectedMode('ESignatureSpecimen')}
            >
              <View style={styles.modeCardHeader}>
                <Icon
                  name="edit"
                  size={theme.sizes.iconSm}
                  color={selectedMode === 'ESignatureSpecimen' ? theme.colors.primary : theme.colors.textMuted}
                />
                <ThemedText
                  variant="captionBold"
                  color={selectedMode === 'ESignatureSpecimen' ? theme.colors.primary : theme.colors.text}
                >
                  E-Signature
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.modeCardDesc}>
                Embedded transparent specimen + digital lock badge
              </ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.modeCard,
                selectedMode === 'DigitalSealOnly' && styles.modeCardActive,
              ]}
              onPress={() => setSelectedMode('DigitalSealOnly')}
            >
              <View style={styles.modeCardHeader}>
                <Icon
                  name="shield"
                  size={theme.sizes.iconSm}
                  color={selectedMode === 'DigitalSealOnly' ? theme.colors.primary : theme.colors.textMuted}
                />
                <ThemedText
                  variant="captionBold"
                  color={selectedMode === 'DigitalSealOnly' ? theme.colors.primary : theme.colors.text}
                >
                  Digital Seal
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.modeCardDesc}>
                Printed credentials + digital verification badge
              </ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.modeCard,
                selectedMode === 'WetSignature' && styles.modeCardActive,
              ]}
              onPress={() => setSelectedMode('WetSignature')}
            >
              <View style={styles.modeCardHeader}>
                <Icon
                  name="file"
                  size={theme.sizes.iconSm}
                  color={selectedMode === 'WetSignature' ? theme.colors.primary : theme.colors.textMuted}
                />
                <ThemedText
                  variant="captionBold"
                  color={selectedMode === 'WetSignature' ? theme.colors.primary : theme.colors.text}
                >
                  Wet Signature
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.modeCardDesc}>
                Blank physical ink line for manual pen signing
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {selectedMode !== 'WetSignature' ? (
          <View style={styles.section}>
            {/* Dual Tabs: Upload vs Draw */}
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tabButton, activeTab === 'upload' && styles.tabButtonActive]}
                onPress={() => setActiveTab('upload')}
              >
                <Icon
                  name="upload"
                  size={theme.sizes.iconSm}
                  color={activeTab === 'upload' ? theme.colors.primary : theme.colors.textMuted}
                />
                <ThemedText
                  variant="smallBold"
                  color={activeTab === 'upload' ? theme.colors.primary : theme.colors.textMuted}
                >
                  Upload Transparent PNG
                </ThemedText>
              </Pressable>

              <Pressable
                style={[styles.tabButton, activeTab === 'draw' && styles.tabButtonActive]}
                onPress={() => setActiveTab('draw')}
              >
                <Icon
                  name="edit"
                  size={theme.sizes.iconSm}
                  color={activeTab === 'draw' ? theme.colors.primary : theme.colors.textMuted}
                />
                <ThemedText
                  variant="smallBold"
                  color={activeTab === 'draw' ? theme.colors.primary : theme.colors.textMuted}
                >
                  Draw Signature Pad
                </ThemedText>
              </Pressable>
            </View>

            {activeTab === 'upload' ? (
              <View style={styles.uploadArea}>
                {uploadError ? (
                  <View style={styles.errorBox}>
                    <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                    <ThemedText variant="caption" color={theme.colors.emergencyText} style={styles.flex1}>
                      {uploadError}
                    </ThemedText>
                  </View>
                ) : null}

                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.tabDescription}>
                  Upload a high-resolution, transparent background PNG of your professional signature specimen (maximum size 500KB).
                </ThemedText>

                <View style={styles.uploadButtonRow}>
                  <Button
                    title="Select PNG File"
                    variant="outline"
                    icon="upload"
                    onPress={handlePickFile}
                    loading={uploading}
                  />
                  {signatureDataUri ? (
                    <Badge label="Specimen Loaded" variant="success" icon="check" />
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.drawArea}>
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.tabDescription}>
                  Sign inside the pad below with your mouse, trackpad, or stylus. Use Undo to remove the last stroke or Clear to start over.
                </ThemedText>

                <View
                  ref={padRef}
                  style={styles.drawPadContainer}
                  {...panResponder.panHandlers}
                  {...(Platform.OS === 'web'
                    ? {
                        onMouseDown: handleMouseDown,
                        onMouseMove: handleMouseMove,
                        onMouseUp: handleMouseUp,
                        onMouseLeave: handleMouseUp,
                      }
                    : {})}
                >
                  {/* SVG rendered strokes */}
                  {strokes.length > 0 || currentStroke.length > 0 ? (
                    <View style={styles.svgContainer} pointerEvents="none">
                      {strokes.map((stroke, index) => (
                        <View key={index} style={styles.strokeLayer}>
                          {stroke.map((pt, pIdx) => (
                            <View
                              key={pIdx}
                              style={[
                                styles.strokeDot,
                                {
                                  left: pt.x - 2,
                                  top: pt.y - 2,
                                },
                              ]}
                            />
                          ))}
                        </View>
                      ))}
                      {currentStroke.map((pt, pIdx) => (
                        <View
                          key={pIdx}
                          style={[
                            styles.strokeDot,
                            {
                              left: pt.x - 2,
                              top: pt.y - 2,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.drawPlaceholder} pointerEvents="none">
                      <Icon name="edit" size={theme.sizes.iconMd} color={theme.colors.textLight} />
                      <ThemedText variant="caption" color={theme.colors.textLight}>
                        Sign here using touch or mouse
                      </ThemedText>
                    </View>
                  )}

                  <View style={styles.signatureLineIndicator} pointerEvents="none" />
                </View>

                <View style={styles.drawControlsRow}>
                  <Button
                    title="Undo"
                    variant="ghost"
                    size="sm"
                    icon="undo"
                    onPress={handleUndoStroke}
                    disabled={strokes.length === 0}
                  />
                  <Button
                    title="Clear"
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    onPress={handleClearStrokes}
                    disabled={strokes.length === 0 && currentStroke.length === 0}
                  />
                  <View style={styles.flex1} />
                  <Button
                    title="Apply Drawing"
                    variant="outline"
                    size="sm"
                    icon="check"
                    onPress={handleApplyDrawing}
                    disabled={strokes.length === 0 && currentStroke.length === 0}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}

        {/* Live Physician Stamp Imprint Preview */}
        <View style={styles.previewSection}>
          <View style={styles.previewHeaderRow}>
            <ThemedText variant="smallBold" color={theme.colors.primary}>
              Physician Stamp Imprint Live Preview
            </ThemedText>
            {selectedMode === 'ESignatureSpecimen' ? (
              <Badge label="Digitally Certified & Locked" variant="success" icon="check" />
            ) : selectedMode === 'DigitalSealOnly' ? (
              <Badge label="Digital Verification Seal" variant="primary" icon="shield" />
            ) : (
              <Badge label="Wet Signature (Pen Signing)" variant="neutral" />
            )}
          </View>

          <View style={styles.stampCard}>
            <View style={styles.stampBox}>
              {/* E-Signature Specimen Overlay */}
              {selectedMode === 'ESignatureSpecimen' ? (
                signatureDataUri ? (
                  <View style={styles.signatureOverlayWrapper}>
                    <Image
                      source={{ uri: signatureDataUri }}
                      style={styles.signatureImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={styles.signatureEmptyPlaceholder}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      [No signature uploaded or drawn yet]
                    </ThemedText>
                  </View>
                )
              ) : selectedMode === 'WetSignature' ? (
                <View style={styles.wetSignatureBlock}>
                  <View style={styles.wetLine} />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Physician Ink Signature
                  </ThemedText>
                </View>
              ) : null}

              {/* Physician Stamp Printed Credentials */}
              <ThemedText variant="bodyBold" color={theme.colors.primary} style={styles.stampName}>
                {doctorName.toUpperCase()}
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                {credentials?.specialty || 'General / Primary Care Medicine'}
              </ThemedText>
              <View style={styles.stampDivider} />
              <ThemedText variant="smallBold" color={theme.colors.text}>
                {credentials?.prc ? `PRC License No. ${credentials.prc}` : 'PRC License No. [Required for Prescriptions]'}
              </ThemedText>
              {credentials?.ptr ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {credentials.ptr}
                </ThemedText>
              ) : null}
              {credentials?.pan ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {`PhilHealth PAN: ${credentials.pan}`}
                </ThemedText>
              ) : null}
              {credentials?.s2 ? (
                <ThemedText variant="captionBold" color={theme.colors.emergency}>
                  {credentials.s2}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.lg,
  },
  section: {
    gap: theme.spacing.sm,
  },
  helperText: {
    marginBottom: theme.spacing.xs,
  },
  modeCardsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modeCard: {
    flex: 1,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  modeCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  modeCardDesc: {
    lineHeight: 14,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.transparent,
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
  },
  uploadArea: {
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  tabDescription: {
    lineHeight: 16,
  },
  uploadButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
  },
  drawArea: {
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  drawPadContainer: {
    width: '100%',
    height: PAD_HEIGHT,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgContainer: {
    ...StyleSheet.absoluteFill,
  },
  strokeLayer: {
    ...StyleSheet.absoluteFill,
  },
  strokeDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.text,
  },
  drawPlaceholder: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  signatureLineIndicator: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.borderLight,
  },
  drawControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  previewSection: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  stampCard: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  stampBox: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    gap: 3,
  },
  signatureOverlayWrapper: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  signatureImage: {
    width: 220,
    height: 54,
  },
  signatureEmptyPlaceholder: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  wetSignatureBlock: {
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  wetLine: {
    width: 200,
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.textMuted,
  },
  stampName: {
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  stampDivider: {
    width: 60,
    height: 2,
    backgroundColor: theme.colors.primary,
    marginVertical: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
