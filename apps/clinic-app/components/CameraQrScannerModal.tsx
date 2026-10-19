import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Button, Icon, ThemedText, Modal } from './ui';
import { theme } from '../constants/theme';

export interface CameraQrScannerModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onScanned: (data: string) => void;
  onClose: () => void;
}

/**
 * Native and web camera scanner modal for patient QR codes, share tokens, and laboratory/prescription slips.
 * Handles permission states (requesting, granted, denied/blocked) and delivers a single scan per presentation.
 * Supports auto (continuous) and manual (tap-to-focus) modes, zoom toggle, and torch for rapid scanning.
 */
export default function CameraQrScannerModal({
  visible,
  title = 'Scan Patient QR',
  subtitle = 'Point camera at the patient QR code or digital share token',
  onScanned,
  onClose,
}: CameraQrScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  // Focus & camera controls
  const [focusMode, setFocusMode] = useState<'auto' | 'manual'>('auto');
  const [autofocusProp, setAutofocusProp] = useState<'off' | 'on'>('off'); // 'off' is continuous AF in expo-camera
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState<number>(0);
  const [focusCoord, setFocusCoord] = useState<{ x: number; y: number } | null>(null);

  // Container measurement refs for accurate cross-platform tap-to-focus positioning
  const cameraContainerRef = useRef<View>(null);
  const containerSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const containerPageOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Focus ring animation
  const focusScale = useRef(new Animated.Value(1.5)).current;
  const focusOpacity = useRef(new Animated.Value(0)).current;
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      handled.current = false;
      setFocusMode('auto');
      setAutofocusProp('off');
      setTorch(false);
      setZoom(0);
      setFocusCoord(null);
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    containerSize.current = { width, height };
    cameraContainerRef.current?.measureInWindow?.((x, y) => {
      if (typeof x === 'number' && !isNaN(x)) {
        containerPageOffset.current = { x, y };
      }
    });
  };

  const triggerFocusPulse = (coord?: { x: number; y: number }) => {
    const targetCoord =
      coord ??
      focusCoord ?? {
        x: (containerSize.current.width || 300) / 2,
        y: (containerSize.current.height || 400) / 2,
      };

    setFocusCoord(targetCoord);

    // Animate focus ring
    focusScale.setValue(1.5);
    focusOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(focusScale, {
        toValue: 1.0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(focusOpacity, {
        toValue: 0,
        delay: 600,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Momentarily toggle autofocus prop to trigger CameraX/AVFoundation focus cycle
    setAutofocusProp('on');
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    focusTimeoutRef.current = setTimeout(() => {
      setFocusCoord(null);
      if (focusMode === 'auto') {
        setAutofocusProp('off');
      }
    }, 1100);
  };

  const handleTapToFocus = (e: GestureResponderEvent) => {
    const native = e.nativeEvent as any;
    let x: number | undefined;
    let y: number | undefined;

    // 1. Check locationX/locationY from nativeEvent (typical for iOS/Android when tapping root surface)
    if (typeof native.locationX === 'number' && !isNaN(native.locationX) && native.locationX > 0) {
      x = native.locationX;
      y = native.locationY;
    }

    // 2. On Web or when locationX is undefined/0, calculate relative to container bounding rect
    const containerEl = cameraContainerRef.current as any;
    const clientRect = containerEl?.getBoundingClientRect ? containerEl.getBoundingClientRect() : null;

    if ((x === undefined || y === undefined) && clientRect) {
      if (typeof native.clientX === 'number' && typeof native.clientY === 'number') {
        x = native.clientX - clientRect.left;
        y = native.clientY - clientRect.top;
      } else if (typeof native.pageX === 'number' && typeof native.pageY === 'number') {
        const scrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;
        const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
        x = native.pageX - (clientRect.left + scrollX);
        y = native.pageY - (clientRect.top + scrollY);
      }
    }

    // 3. Fallback to pageX/pageY with measured container window offset on native platforms
    if ((x === undefined || y === undefined) && typeof native.pageX === 'number' && typeof native.pageY === 'number') {
      if (containerPageOffset.current && containerPageOffset.current.x > 0) {
        x = native.pageX - containerPageOffset.current.x;
        y = native.pageY - containerPageOffset.current.y;
      }
    }

    // 4. Check native offsetX/offsetY
    if ((x === undefined || y === undefined) && typeof native.offsetX === 'number' && typeof native.offsetY === 'number') {
      x = native.offsetX;
      y = native.offsetY;
    }

    // 5. Safe Fallback: if coordinates could not be resolved, default to the center of the camera viewport, NEVER (0,0)
    const containerWidth = containerSize.current.width || 300;
    const containerHeight = containerSize.current.height || 400;
    if (typeof x !== 'number' || isNaN(x) || typeof y !== 'number' || isNaN(y)) {
      x = containerWidth / 2;
      y = containerHeight / 2;
    }

    // Clamp coordinates within container boundaries so the 60px ring is never clipped off-screen
    x = Math.max(30, Math.min(x, containerWidth - 30));
    y = Math.max(30, Math.min(y, containerHeight - 30));

    triggerFocusPulse({ x, y });
  };

  const handleModeSwitch = (mode: 'auto' | 'manual') => {
    setFocusMode(mode);
    if (mode === 'auto') {
      setAutofocusProp('off'); // continuous autofocus
    } else {
      setAutofocusProp('on'); // lock focus
      triggerFocusPulse();
    }
  };

  const handleScan = (result: BarcodeScanningResult) => {
    if (handled.current) return;
    const raw = result.data?.trim();
    if (!raw) return;
    handled.current = true;
    onScanned(raw);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal raw visible={visible} animationType="slide" transparent={false} onClose={onClose}>
      <View style={styles.container}>
        {/* Header Overlay */}
        <View style={styles.header}>
          <ThemedText variant="h3" color={theme.colors.textInverted}>
            {title}
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.textLight} style={styles.headerSubtitle}>
            {subtitle}
          </ThemedText>
        </View>

        {/* Camera / Permission Body */}
        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <ThemedText variant="body" color={theme.colors.textInverted}>
              Initializing camera…
            </ThemedText>
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <ThemedText variant="body" color={theme.colors.textInverted} style={styles.message}>
              {permission.canAskAgain
                ? 'Camera access is required to scan patient QR codes and share tokens.'
                : 'Camera permission is disabled. Please enable camera access in your device settings to scan QR codes.'}
            </ThemedText>
            <View style={styles.permissionActions}>
              <Button
                title={permission.canAskAgain ? 'Grant Camera Access' : 'Open Device Settings'}
                variant="primary"
                onPress={() => {
                  if (permission.canAskAgain) {
                    void requestPermission();
                  } else {
                    void Linking.openSettings();
                  }
                }}
              />
              <Button title="Cancel" variant="ghost" onPress={onClose} />
            </View>
          </View>
        ) : (
          <View
            ref={cameraContainerRef}
            style={styles.cameraContainer}
            onLayout={handleContainerLayout}
          >
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan}
              autofocus={autofocusProp}
              enableTorch={torch}
              zoom={zoom}
            />

            {/* Tap-to-focus transparent touch surface (unobstructed full plane) */}
            <Pressable
              style={StyleSheet.absoluteFill}
              onPressIn={handleTapToFocus}
              accessibilityLabel="Tap viewfinder to focus camera"
            />

            {/* Target Reticle Frame (passive visual overlay) */}
            <View style={styles.reticleOverlay} pointerEvents="none">
              <View style={styles.reticleFrame} />
              <View style={styles.hintBadge}>
                <ThemedText variant="captionBold" color={theme.colors.textInverted}>
                  {focusMode === 'auto'
                    ? 'Auto-focus active • Tap anywhere to focus on code'
                    : 'Manual focus locked • Tap code to focus'}
                </ThemedText>
              </View>
            </View>

            {/* Dynamic tap-to-focus indicator ring */}
            {focusCoord && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.focusRing,
                  {
                    left: focusCoord.x - 30,
                    top: focusCoord.y - 30,
                    transform: [{ scale: focusScale }],
                    opacity: focusOpacity,
                  },
                ]}
              >
                <View style={styles.focusCenterDot} />
              </Animated.View>
            )}

            {/* Quick Camera Tuning Controls Overlay */}
            <View style={styles.controlsStrip}>
              <View style={styles.controlGroup}>
                <Pressable
                  style={[styles.controlPill, focusMode === 'auto' && styles.controlPillActive]}
                  onPress={() => handleModeSwitch('auto')}
                  accessibilityRole="button"
                  accessibilityLabel="Auto Focus mode"
                >
                  <Icon
                    name="scan"
                    size={theme.sizes.iconSm}
                    color={focusMode === 'auto' ? theme.colors.textInverted : theme.colors.textLight}
                  />
                  <ThemedText
                    variant="captionBold"
                    color={focusMode === 'auto' ? theme.colors.textInverted : theme.colors.textLight}
                  >
                    Auto
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={[styles.controlPill, focusMode === 'manual' && styles.controlPillActive]}
                  onPress={() => handleModeSwitch('manual')}
                  accessibilityRole="button"
                  accessibilityLabel="Manual Focus mode"
                >
                  <Icon
                    name="eye"
                    size={theme.sizes.iconSm}
                    color={focusMode === 'manual' ? theme.colors.textInverted : theme.colors.textLight}
                  />
                  <ThemedText
                    variant="captionBold"
                    color={focusMode === 'manual' ? theme.colors.textInverted : theme.colors.textLight}
                  >
                    Manual
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={styles.controlIconBtn}
                  onPress={() => triggerFocusPulse()}
                  accessibilityRole="button"
                  accessibilityLabel="Trigger Refocus"
                >
                  <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.textInverted} />
                </Pressable>
              </View>

              <View style={styles.controlGroup}>
                <Pressable
                  style={[styles.controlIconBtn, torch && styles.controlIconBtnActive]}
                  onPress={() => setTorch((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Torch"
                >
                  <Icon
                    name="zap"
                    size={theme.sizes.iconSm}
                    color={torch ? theme.colors.warning : theme.colors.textInverted}
                  />
                </Pressable>

                <Pressable
                  style={[styles.controlPill, zoom > 0 && styles.controlPillActive]}
                  onPress={() => setZoom((prev) => (prev === 0 ? 0.25 : 0))}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Zoom 1x or 2x"
                >
                  <ThemedText
                    variant="captionBold"
                    color={zoom > 0 ? theme.colors.textInverted : theme.colors.textLight}
                  >
                    {zoom > 0 ? '2x' : '1x'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Footer Actions */}
        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
            <ThemedText variant="bodyBold" color={theme.colors.surfaceInverse}>
              Close Scanner
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceInverse,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? theme.spacing['3xl'] : theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    zIndex: 10,
  },
  headerSubtitle: {
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  permissionActions: {
    gap: theme.spacing.md,
    width: '100%',
    maxWidth: 280,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.transparent,
  },
  hintBadge: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.overlay,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
  },
  focusRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: theme.radii.full,
    borderWidth: 2,
    borderColor: theme.colors.focusRing,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.transparent,
  },
  focusCenterDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.focusRing,
  },
  controlsStrip: {
    position: 'absolute',
    top: theme.spacing.md,
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.overlay,
    padding: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  controlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.transparent,
  },
  controlPillActive: {
    backgroundColor: theme.colors.primary,
  },
  controlIconBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.transparent,
  },
  controlIconBtnActive: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  footer: {
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
    zIndex: 10,
  },
  cancelButton: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing['2xl'],
    borderRadius: theme.radii.lg,
  },
});
