import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Platform,
  Pressable,
} from 'react-native';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';

export interface LogoCropModalProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onConfirm: (croppedDataUri: string) => Promise<void> | void;
}

const VIEWPORT_SIZE = 260;
const OUTPUT_SIZE = 512;

function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof (window as any).Image !== 'undefined') {
      const img = new (window as any).Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || 300,
          height: img.naturalHeight || 300,
        });
      };
      img.onerror = () => resolve({ width: 300, height: 300 });
      img.src = uri;
      return;
    }

    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 300, height: 300 })
    );
  });
}

export default function LogoCropModal({
  visible,
  imageUri,
  onClose,
  onConfirm,
}: LogoCropModalProps) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: 300,
    height: 300,
  });
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [saving, setSaving] = useState<boolean>(false);

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const pinchRef = useRef<{
    initialDist: number;
    initialZoom: number;
    initialMid: { x: number; y: number };
    initialPan: { x: number; y: number };
  } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const viewportWrapperRef = useRef<any>(null);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Load natural dimensions when a new image is loaded
  useEffect(() => {
    if (visible && imageUri) {
      setZoom(1);
      zoomRef.current = 1;
      setPan({ x: 0, y: 0 });
      panRef.current = { x: 0, y: 0 };

      getImageDimensions(imageUri).then((size) => {
        setNaturalSize(size);
      });
    }
  }, [visible, imageUri]);

  const getTouchCoords = (t: any) => ({
    x: t.clientX ?? t.pageX ?? 0,
    y: t.clientY ?? t.pageY ?? 0,
  });

  const getTouchesDistance = (t1: any, t2: any) => {
    const c1 = getTouchCoords(t1);
    const c2 = getTouchCoords(t2);
    return Math.hypot(c1.x - c2.x, c1.y - c2.y);
  };

  const getTouchesMidpoint = (t1: any, t2: any) => {
    const c1 = getTouchCoords(t1);
    const c2 = getTouchCoords(t2);
    return {
      x: (c1.x + c2.x) / 2,
      y: (c1.y + c2.y) / 2,
    };
  };

  const handlePointerDown = (e: any) => {
    // Only handle mouse pointer down (touch events are handled specifically for multi-touch pinch)
    if (e.pointerType === 'touch') return;
    isDraggingRef.current = true;
    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? e.nativeEvent?.pageX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? e.nativeEvent?.pageY ?? 0;
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  };

  const handlePointerMove = (e: any) => {
    if (e.pointerType === 'touch') return;
    if (!isDraggingRef.current) return;
    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? e.nativeEvent?.pageX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? e.nativeEvent?.pageY ?? 0;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    setPan({
      x: Math.round(dragStartRef.current.panX + dx),
      y: Math.round(dragStartRef.current.panY + dy),
    });
  };

  const handlePointerUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      panRef.current = { ...pan };
    }
  };

  const handleTouchStart = (e: any) => {
    const touches = e.touches || e.nativeEvent?.touches;
    if (!touches || touches.length === 0) return;

    // Two-finger touch -> start pinch-to-zoom
    if (touches.length >= 2) {
      if (e.cancelable && e.preventDefault) e.preventDefault();
      isDraggingRef.current = false;
      const dist = getTouchesDistance(touches[0], touches[1]);
      const mid = getTouchesMidpoint(touches[0], touches[1]);
      pinchRef.current = {
        initialDist: dist,
        initialZoom: zoomRef.current,
        initialMid: mid,
        initialPan: { ...panRef.current },
      };
      return;
    }

    // Single-finger touch -> start pan
    if (touches.length === 1) {
      pinchRef.current = null;
      isDraggingRef.current = true;
      const c = getTouchCoords(touches[0]);
      dragStartRef.current = {
        x: c.x,
        y: c.y,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
    }
  };

  const handleTouchMove = (e: any) => {
    const touches = e.touches || e.nativeEvent?.touches;
    if (!touches || touches.length === 0) return;

    // Two-finger pinch gesture
    if (touches.length >= 2 && pinchRef.current) {
      if (e.cancelable && e.preventDefault) e.preventDefault();
      const currentDist = getTouchesDistance(touches[0], touches[1]);
      if (pinchRef.current.initialDist > 0) {
        const factor = currentDist / pinchRef.current.initialDist;
        const newZoom = Math.min(4, Math.max(0.5, Number((pinchRef.current.initialZoom * factor).toFixed(2))));
        setZoom(newZoom);
        zoomRef.current = newZoom;

        // Smooth simultaneous midpoint panning
        const currentMid = getTouchesMidpoint(touches[0], touches[1]);
        const midDx = currentMid.x - pinchRef.current.initialMid.x;
        const midDy = currentMid.y - pinchRef.current.initialMid.y;
        setPan({
          x: Math.round(pinchRef.current.initialPan.x + midDx),
          y: Math.round(pinchRef.current.initialPan.y + midDy),
        });
      }
      return;
    }

    // Single-finger drag
    if (touches.length === 1 && isDraggingRef.current) {
      const c = getTouchCoords(touches[0]);
      const dx = c.x - dragStartRef.current.x;
      const dy = c.y - dragStartRef.current.y;
      setPan({
        x: Math.round(dragStartRef.current.panX + dx),
        y: Math.round(dragStartRef.current.panY + dy),
      });
    }
  };

  const handleTouchEnd = (e: any) => {
    const touches = e.touches || e.nativeEvent?.touches;
    if (touches && touches.length === 1) {
      // Transition smoothly from pinch back to 1-finger drag
      pinchRef.current = null;
      isDraggingRef.current = true;
      const c = getTouchCoords(touches[0]);
      dragStartRef.current = {
        x: c.x,
        y: c.y,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      return;
    }

    if (!touches || touches.length === 0) {
      pinchRef.current = null;
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        panRef.current = { ...pan };
      }
    }
  };

  const handleWheel = (e: any) => {
    if (e?.preventDefault) e.preventDefault();
    if (Platform.OS === 'web') {
      if (e?.ctrlKey) {
        // Trackpad pinch-to-zoom sends wheel events with ctrlKey=true
        const factor = Math.exp(-e.deltaY * 0.01);
        setZoom((prev) => {
          const next = Math.min(4, Math.max(0.5, Number((prev * factor).toFixed(2))));
          zoomRef.current = next;
          return next;
        });
      } else if (e?.deltaY) {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom((prev) => {
          const next = Math.min(4, Math.max(0.5, Number((prev + delta).toFixed(2))));
          zoomRef.current = next;
          return next;
        });
      }
    }
  };

  // Attach non-passive touch listeners on web DOM to cleanly intercept multi-touch pinch gestures
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const el = viewportWrapperRef.current;
    if (!el) return;

    const onNativeTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2 && e.cancelable) {
        e.preventDefault();
      }
      handleTouchStart(e);
    };

    const onNativeTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && e.cancelable) {
        e.preventDefault();
      }
      handleTouchMove(e);
    };

    const onNativeTouchEnd = (e: TouchEvent) => {
      handleTouchEnd(e);
    };

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleWheel(e);
    };

    el.addEventListener('touchstart', onNativeTouchStart, { passive: false });
    el.addEventListener('touchmove', onNativeTouchMove, { passive: false });
    el.addEventListener('touchend', onNativeTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onNativeTouchEnd, { passive: false });
    el.addEventListener('wheel', onNativeWheel, { passive: false });

    const onGlobalPointerMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: Math.round(dragStartRef.current.panX + dx),
        y: Math.round(dragStartRef.current.panY + dy),
      });
    };

    const onGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        panRef.current = { ...pan };
      }
    };

    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp);

    return () => {
      el.removeEventListener('touchstart', onNativeTouchStart);
      el.removeEventListener('touchmove', onNativeTouchMove);
      el.removeEventListener('touchend', onNativeTouchEnd);
      el.removeEventListener('touchcancel', onNativeTouchEnd);
      el.removeEventListener('wheel', onNativeWheel);
      window.removeEventListener('pointermove', onGlobalPointerMove);
      window.removeEventListener('pointerup', onGlobalPointerUp);
    };
  }, [pan]);

  // Base scale calculation to fit the crop viewport
  const baseScale = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) return 1;
    return Math.min(
      VIEWPORT_SIZE / naturalSize.width,
      VIEWPORT_SIZE / naturalSize.height
    );
  }, [naturalSize]);

  // Fill scale calculation to completely cover the crop viewport
  const fillScaleRatio = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) return 1;
    const coverScale = Math.max(
      VIEWPORT_SIZE / naturalSize.width,
      VIEWPORT_SIZE / naturalSize.height
    );
    return Math.max(1, coverScale / (baseScale || 1));
  }, [naturalSize, baseScale]);

  const displayedWidth = naturalSize.width * baseScale * zoom;
  const displayedHeight = naturalSize.height * baseScale * zoom;

  const imgLeft = (VIEWPORT_SIZE - displayedWidth) / 2 + pan.x;
  const imgTop = (VIEWPORT_SIZE - displayedHeight) / 2 + pan.y;

  // Small preview scales
  const sidebarPreviewScale = 40 / VIEWPORT_SIZE;
  const cardPreviewScale = 64 / VIEWPORT_SIZE;

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(4, Number((prev + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, Number((prev - 0.15).toFixed(2))));
  };

  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFill = () => {
    setZoom(Number(fillScaleRatio.toFixed(2)));
    setPan({ x: 0, y: 0 });
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleApply = async () => {
    if (!imageUri) return;
    setSaving(true);

    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const croppedDataUri = await new Promise<string>((resolve, reject) => {
          const img = new (window as any).Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = OUTPUT_SIZE;
              canvas.height = OUTPUT_SIZE;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(imageUri);
                return;
              }

              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';

              const canvasScale = OUTPUT_SIZE / VIEWPORT_SIZE;
              const destX = imgLeft * canvasScale;
              const destY = imgTop * canvasScale;
              const destWidth = displayedWidth * canvasScale;
              const destHeight = displayedHeight * canvasScale;

              ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
              ctx.drawImage(img, destX, destY, destWidth, destHeight);

              resolve(canvas.toDataURL('image/png'));
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = () => resolve(imageUri);
          img.src = imageUri;
        });

        await onConfirm(croppedDataUri);
      } else {
        await onConfirm(imageUri);
      }
    } catch {
      await onConfirm(imageUri);
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !imageUri) return null;

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Adjust & Crop Clinic Logo"
      subtitle="Zoom and drag the image to frame your logo for the workstation sidebar, header, and official receipts."
      maxWidth={520}
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Cancel"
            variant="outline"
            onPress={onClose}
            disabled={saving}
          />
          <Button
            title="Apply & Save Logo"
            variant="primary"
            icon="check"
            onPress={handleApply}
            loading={saving}
            disabled={saving}
          />
        </View>
      }
    >
      <View style={styles.body}>
        {/* Main Crop Area */}
        <View style={styles.cropSection}>
          <View
            ref={viewportWrapperRef}
            style={[styles.viewportWrapper, Platform.OS === 'web' ? ({ cursor: 'grab' } as any) : null]}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            {...(Platform.OS === 'web' ? { onWheel: handleWheel } : {})}
          >
            {/* Image layer */}
            <View style={styles.viewport}>
              <Image
                source={{ uri: imageUri }}
                style={{
                  position: 'absolute',
                  left: imgLeft,
                  top: imgTop,
                  width: displayedWidth,
                  height: displayedHeight,
                }}
                resizeMode="contain"
              />
            </View>

            {/* Corner guide overlay */}
            <View style={styles.cropOverlayBorder} pointerEvents="none" />
          </View>

          <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.dragHelpText}>
            Drag to reposition • Pinch or scroll to zoom
          </ThemedText>
        </View>

        {/* Zoom & Alignment Controls */}
        <View style={styles.controlsCard}>
          <View style={styles.zoomControlRow}>
            <Pressable
              onPress={handleZoomOut}
              disabled={zoom <= 0.5}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              style={({ pressed, hovered }: any) => [
                styles.iconButton,
                hovered && styles.iconButtonHover,
                pressed && styles.iconButtonPressed,
                zoom <= 0.5 && styles.iconButtonDisabled,
              ]}
            >
              <Icon name="zoomOut" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>

            <View style={styles.zoomTrack}>
              <View
                style={[
                  styles.zoomFill,
                  { width: `${Math.min(100, Math.max(0, ((zoom - 0.5) / 3.5) * 100))}%` },
                ]}
              />
            </View>

            <Pressable
              onPress={handleZoomIn}
              disabled={zoom >= 4}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              style={({ pressed, hovered }: any) => [
                styles.iconButton,
                hovered && styles.iconButtonHover,
                pressed && styles.iconButtonPressed,
                zoom >= 4 && styles.iconButtonDisabled,
              ]}
            >
              <Icon name="zoomIn" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>

            <View style={styles.zoomBadge}>
              <ThemedText variant="captionBold" color={theme.colors.text}>
                {Math.round(zoom * 100)}%
              </ThemedText>
            </View>
          </View>

          {/* Quick Presets */}
          <View style={styles.presetButtonsRow}>
            <Button
              title="Fit (Contain)"
              size="sm"
              variant={zoom === 1 ? 'secondary' : 'ghost'}
              onPress={handleFit}
            />
            <Button
              title="Fill (Cover)"
              size="sm"
              variant={zoom === Number(fillScaleRatio.toFixed(2)) ? 'secondary' : 'ghost'}
              onPress={handleFill}
            />
            <Button
              title="Reset"
              size="sm"
              variant="ghost"
              icon="refresh"
              onPress={handleReset}
            />
          </View>
        </View>

        {/* Live Placement Previews */}
        <View style={styles.previewsCard}>
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Live Placement Previews
          </ThemedText>
          <View style={styles.previewsRow}>
            {/* Sidebar Rail Preview (40x40) */}
            <View style={styles.previewItem}>
              <View style={styles.sidebarPreviewBox}>
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    position: 'absolute',
                    left: imgLeft * sidebarPreviewScale,
                    top: imgTop * sidebarPreviewScale,
                    width: displayedWidth * sidebarPreviewScale,
                    height: displayedHeight * sidebarPreviewScale,
                  }}
                  resizeMode="contain"
                />
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Sidebar (40px)
              </ThemedText>
            </View>

            {/* General Settings Preview (64x64) */}
            <View style={styles.previewItem}>
              <View style={styles.cardPreviewBox}>
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    position: 'absolute',
                    left: imgLeft * cardPreviewScale,
                    top: imgTop * cardPreviewScale,
                    width: displayedWidth * cardPreviewScale,
                    height: displayedHeight * cardPreviewScale,
                  }}
                  resizeMode="contain"
                />
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Settings / Card (64px)
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: theme.spacing.lg,
  },
  cropSection: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  viewportWrapper: {
    width: VIEWPORT_SIZE,
    height: VIEWPORT_SIZE,
    position: 'relative',
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    ...Platform.select({
      web: {
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
      } as any,
    }),
  },
  viewport: {
    width: VIEWPORT_SIZE,
    height: VIEWPORT_SIZE,
    position: 'relative',
    overflow: 'hidden',
  },
  cropOverlayBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.lg,
  },
  dragHelpText: {
    textAlign: 'center',
  },
  controlsCard: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  zoomControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  iconButton: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonHover: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  iconButtonPressed: {
    opacity: 0.8,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  zoomTrack: {
    flex: 1,
    height: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.full,
    overflow: 'hidden',
  },
  zoomFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.full,
  },
  zoomBadge: {
    minWidth: 48,
    alignItems: 'flex-end',
  },
  presetButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  previewsCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  previewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['2xl'],
  },
  previewItem: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  sidebarPreviewBox: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    backgroundColor: 'transparent',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    position: 'relative',
  },
  cardPreviewBox: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
  },
});
