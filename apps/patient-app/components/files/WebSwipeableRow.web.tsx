import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';

const SWIPE_ROW_OPEN_EVENT = 'clinicez-web-swipe-row-open';
const DIRECTION_LOCK_PX = 8;

export interface WebSwipeableRowProps {
  rowId: string;
  actionWidth: number;
  renderRightActions: (close: () => void) => React.ReactNode;
  children: (interaction: {
    isOpen: boolean;
    close: () => void;
    consumeDragGuard: () => boolean;
  }) => React.ReactNode;
}

/**
 * Touch + pointer swipe-to-reveal container for web record lists.
 * - Uses `touchAction: 'pan-y'` so native vertical browser scrolling never stalls on mobile web.
 * - Supports both finger swipe (mobile/tablet web) and mouse drag (desktop web).
 * - Automatically closes any previously opened row when another row is swiped open.
 */
export function WebSwipeableRow({
  rowId,
  actionWidth,
  renderRightActions,
  children,
}: WebSwipeableRowProps) {
  const { radii } = useAppTheme();
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const offsetRef = useRef(0);
  const gestureRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    baseOffset: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    locked: 'horizontal' | 'vertical' | null;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    baseOffset: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    locked: null,
  });
  const suppressClickUntilRef = useRef(0);

  const snapTo = useCallback(
    (nextOffset: number) => {
      const clamped = nextOffset < 0 ? -actionWidth : 0;
      offsetRef.current = clamped;
      setTranslateX(clamped);
      setIsDragging(false);
      if (clamped < 0) {
        DeviceEventEmitter.emit(SWIPE_ROW_OPEN_EVENT, { rowId });
      }
    },
    [actionWidth, rowId]
  );

  const close = useCallback(() => {
    offsetRef.current = 0;
    setTranslateX(0);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SWIPE_ROW_OPEN_EVENT, (payload?: { rowId?: string }) => {
      if (payload?.rowId && payload.rowId !== rowId && offsetRef.current !== 0) {
        close();
      }
    });
    return () => sub.remove();
  }, [close, rowId]);

  useEffect(() => {
    if (translateX === 0 || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, translateX]);

  const consumeDragGuard = useCallback(() => {
    if (Date.now() < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      return true;
    }
    return false;
  }, []);

  const handlePointerDown = (e: any) => {
    // Only primary mouse button or touch/pen
    if (typeof e.button === 'number' && e.button !== 0) return;
    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.pageY ?? 0;

    gestureRef.current = {
      pointerId: e.pointerId ?? 1,
      startX: clientX,
      startY: clientY,
      baseOffset: offsetRef.current,
      lastX: clientX,
      lastTime: Date.now(),
      velocityX: 0,
      locked: null,
    };
  };

  const handlePointerMove = (e: any) => {
    const g = gestureRef.current;
    if (g.pointerId === null) return;
    if (typeof e.pointerId === 'number' && e.pointerId !== g.pointerId) return;

    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.pageY ?? 0;
    const dx = clientX - g.startX;
    const dy = clientY - g.startY;

    if (g.locked === null) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) {
        return;
      }
      if (Math.abs(dy) > Math.abs(dx)) {
        g.locked = 'vertical';
        g.pointerId = null;
        return;
      }
      g.locked = 'horizontal';
      setIsDragging(true);
      try {
        e.currentTarget?.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    }

    if (g.locked !== 'horizontal') return;

    const nowMs = Date.now();
    const dt = Math.max(1, nowMs - g.lastTime);
    g.velocityX = (clientX - g.lastX) / dt;
    g.lastX = clientX;
    g.lastTime = nowMs;

    const rawNext = g.baseOffset + dx;
    // Clamp right overshoot to 0; allow subtle elastic pull past -actionWidth
    let next = Math.min(0, rawNext);
    if (next < -actionWidth) {
      const extra = -actionWidth - next;
      next = -actionWidth - extra * 0.2;
    }

    offsetRef.current = next;
    setTranslateX(next);
  };

  const finishGesture = (e: any) => {
    const g = gestureRef.current;
    if (g.pointerId === null) return;

    const wasHorizontal = g.locked === 'horizontal';
    g.pointerId = null;
    g.locked = null;

    if (!wasHorizontal) return;

    try {
      e.currentTarget?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }

    suppressClickUntilRef.current = Date.now() + 260;

    const current = offsetRef.current;
    const shouldOpen =
      g.velocityX < -0.35 ||
      (g.velocityX <= 0.25 && Math.abs(current) >= actionWidth * 0.3);

    snapTo(shouldOpen ? -actionWidth : 0);
  };

  const isOpen = translateX < -2;

  return (
    <View style={[styles.container, { borderRadius: radii.lg }]}>
      {/* Background revealed right actions */}
      <View
        style={[
          styles.actionsTray,
          {
            width: actionWidth,
            borderRadius: radii.lg,
            opacity: translateX < 0 ? 1 : 0,
          },
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        {renderRightActions(close)}
      </View>

      {/* Foreground draggable surface */}
      <View
        {...({
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: finishGesture,
          onPointerCancel: finishGesture,
        } as any)}
        style={[
          styles.foreground,
          {
            transform: [{ translateX }],
          },
          ({
            touchAction: 'pan-y',
            userSelect: 'none',
            transitionProperty: isDragging ? 'none' : 'transform',
            transitionDuration: isDragging ? '0ms' : '200ms',
            transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          } as any),
        ]}
      >
        {children({ isOpen, close, consumeDragGuard })}
      </View>
    </View>
  );
}

export default WebSwipeableRow;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  actionsTray: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  foreground: {
    width: '100%',
  },
});
