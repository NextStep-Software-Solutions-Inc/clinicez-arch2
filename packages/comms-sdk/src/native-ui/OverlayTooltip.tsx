import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  createShadows,
  fontSizeScale,
  isLiveWebDom,
  lightColors,
  radiusScale,
  spaceScale
} from '@clinicez/design-tokens';
import type { CommsThemeColors, CommsThemeShadows } from './types';

export interface OverlayTooltipProps {
  label: string;
  placement?: 'top' | 'bottom';
  colors?: CommsThemeColors;
  shadows?: CommsThemeShadows;
  style?: any;
  children: React.ReactNode;
}

export const OverlayTooltip: React.FC<OverlayTooltipProps> = ({
  label,
  placement = 'top',
  colors: colorsProp,
  shadows: shadowsProp,
  style,
  children
}) => {
  const [hovered, setHovered] = useState(false);
  const wrapperRef = useRef<any>(null);
  const [anchorNode, setAnchorNode] = useState<HTMLElement | null>(null);

  const resolvedColors = useMemo(
    () => ({ ...lightColors, ...(colorsProp ?? {}) }),
    [colorsProp]
  );
  const resolvedShadows = useMemo(
    () => ({ ...createShadows(resolvedColors, isLiveWebDom), ...(shadowsProp ?? {}) }),
    [resolvedColors, shadowsProp]
  );
  const styles = useMemo(
    () => createStyles(resolvedColors, resolvedShadows),
    [resolvedColors, resolvedShadows]
  );

  const canPortalToBody = Boolean(
    isLiveWebDom &&
      typeof document !== 'undefined' &&
      document.body &&
      anchorNode &&
      typeof anchorNode.getBoundingClientRect === 'function'
  );

  const captureAnchorAndShow = (event?: any) => {
    const candidate =
      (event?.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function'
        ? event.currentTarget
        : null) ??
      (wrapperRef.current && typeof wrapperRef.current.getBoundingClientRect === 'function'
        ? wrapperRef.current
        : null);
    if (candidate) {
      setAnchorNode(candidate);
    }
    setHovered(true);
  };

  useEffect(() => {
    if (!hovered || !label || !canPortalToBody || !anchorNode || typeof document === 'undefined') {
      return undefined;
    }

    const tipEl = document.createElement('div');
    tipEl.setAttribute('role', 'tooltip');
    tipEl.setAttribute('data-overlay-tooltip', 'true');
    tipEl.textContent = label;

    const webBoxShadow =
      (resolvedShadows.lg as unknown as { boxShadow?: string })?.boxShadow ||
      '0 10px 25px -5px rgba(15, 23, 42, 0.38)';

    Object.assign(tipEl.style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      visibility: 'hidden',
      backgroundColor: resolvedColors.surfaceInverse,
      color: resolvedColors.textInverted,
      border: `1px solid ${resolvedColors.borderDark}`,
      borderRadius: `${radiusScale.xs}px`,
      padding: `${spaceScale.xxs}px ${spaceScale.xs}px`,
      fontSize: `${fontSizeScale.xs}px`,
      fontWeight: '600',
      lineHeight: '16px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: webBoxShadow,
      maxWidth: 'calc(100vw - 16px)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    document.body.appendChild(tipEl);

    const updatePosition = () => {
      if (!anchorNode.isConnected) {
        tipEl.style.visibility = 'hidden';
        return;
      }
      const rect = anchorNode.getBoundingClientRect();
      const tipRect = tipEl.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

      const rawLeft = rect.left + rect.width / 2 - tipRect.width / 2;
      const left = Math.max(margin, Math.min(rawLeft, vw - tipRect.width - margin));

      let top =
        placement === 'bottom'
          ? rect.bottom + gap
          : rect.top - tipRect.height - gap;

      if (placement === 'bottom' && top + tipRect.height > vh - margin && rect.top - tipRect.height - gap >= margin) {
        top = rect.top - tipRect.height - gap;
      } else if (placement === 'top' && top < margin && rect.bottom + tipRect.height + gap <= vh - margin) {
        top = rect.bottom + gap;
      }
      top = Math.max(margin, Math.min(top, vh - tipRect.height - margin));

      tipEl.style.left = `${Math.round(left)}px`;
      tipEl.style.top = `${Math.round(top)}px`;
      tipEl.style.visibility = 'visible';
    };

    updatePosition();
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      }
      tipEl.remove();
    };
  }, [
    anchorNode,
    canPortalToBody,
    hovered,
    label,
    placement,
    resolvedColors.borderDark,
    resolvedColors.surfaceInverse,
    resolvedColors.textInverted,
    resolvedShadows.lg,
  ]);

  const webHoverHandlers: Record<string, (e?: any) => void> = {
    onMouseEnter: captureAnchorAndShow,
    onMouseLeave: () => setHovered(false),
    onFocus: captureAnchorAndShow,
    onBlur: () => setHovered(false)
  };

  return (
    <View
      ref={wrapperRef}
      style={[styles.wrapper, hovered && styles.wrapperHovered, style]}
      {...webHoverHandlers}
    >
      {children}
      {hovered && label && !canPortalToBody ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltipOuter,
            placement === 'bottom' ? styles.tooltipBottom : styles.tooltipTop
          ]}
        >
          <View style={styles.tooltipBubble} accessibilityRole="text">
            <Text style={styles.tooltipText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

function createStyles(
  c: Record<keyof typeof lightColors, string>,
  s: ReturnType<typeof createShadows>
) {
  return StyleSheet.create({
    wrapper: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'visible'
    },
    wrapperHovered: {
      zIndex: 999999
    },
    tooltipOuter: {
      position: 'absolute',
      left: -100,
      right: -100,
      alignItems: 'center',
      zIndex: 999999,
      elevation: 999
    },
    tooltipTop: {
      bottom: '100%',
      marginBottom: spaceScale.xs
    },
    tooltipBottom: {
      top: '100%',
      marginTop: spaceScale.xs
    },
    tooltipBubble: {
      backgroundColor: c.surfaceInverse,
      borderColor: c.borderDark,
      borderWidth: 1,
      borderRadius: radiusScale.xs,
      paddingHorizontal: spaceScale.xs,
      paddingVertical: spaceScale.xxs,
      ...s.lg
    },
    tooltipText: {
      color: c.textInverted,
      fontSize: fontSizeScale.xs,
      fontWeight: '600'
    }
  });
}
