import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui';
import {
  ToothSurfaceCode,
  ToothStatus,
  getSurfacesForQuadrant,
  getSurfaceZoneColor,
} from './dentalUtils';

export interface ToothConditionItem {
  status: ToothStatus;
  surface?: string | null;
  activeSurface?: string | null;
  isCurrent?: boolean;
  isVoided?: boolean;
  notes?: string | null;
}

export interface ToothSurfaceDiagramProps {
  toothNumber: number;
  surfaces?: string;
  status?: ToothStatus;
  conditions?: Array<ToothConditionItem>;
  size?: number;
  interactive?: boolean;
  selectedSurfaces?: string[] | string;
  stagedStatus?: ToothStatus;
  onToggleSurface?: (surface: ToothSurfaceCode) => void;
  disabled?: boolean;
  showLabels?: boolean;
  testID?: string;
}

const SURFACE_NAMES: Record<ToothSurfaceCode, string> = {
  B: 'Buccal',
  L: 'Lingual',
  M: 'Mesial',
  D: 'Distal',
  O: 'Occlusal',
};

const TRAPEZOID_PATHS = {
  top: 'M 0 0 L 100 0 L 72 28 L 28 28 Z',
  bottom: 'M 28 72 L 72 72 L 100 100 L 0 100 Z',
  left: 'M 0 0 L 28 28 L 28 72 L 0 100 Z',
  right: 'M 72 28 L 100 0 L 100 100 L 72 72 Z',
} as const;

export function ToothSurfaceDiagram({
  toothNumber,
  surfaces,
  status,
  conditions,
  size = 24,
  interactive = false,
  selectedSurfaces,
  stagedStatus,
  onToggleSurface,
  disabled = false,
  showLabels,
  testID = 'tooth-surface-diagram',
}: ToothSurfaceDiagramProps) {
  const surfacesOrientation = getSurfacesForQuadrant(toothNumber);

  // Normalize effective conditions array (filtering out historical superseded and voided records)
  const effectiveConditions = React.useMemo<ToothConditionItem[]>(() => {
    if (conditions && conditions.length > 0) {
      return conditions.filter((c) => !c.isVoided && c.isCurrent !== false);
    }
    if (status || surfaces) {
      return [{ status: status || 'Healthy', surface: surfaces || '', isCurrent: true }];
    }
    return [];
  }, [conditions, status, surfaces]);

  // Selected surfaces set for interactive staging mode
  const selectedSet = React.useMemo<Set<string>>(() => {
    if (!selectedSurfaces) return new Set<string>();
    if (Array.isArray(selectedSurfaces)) {
      return new Set(selectedSurfaces.map((s) => s.toUpperCase()));
    }
    return new Set(selectedSurfaces.toUpperCase().split(''));
  }, [selectedSurfaces]);

  const shouldShowLabels = showLabels !== undefined ? showLabels : size >= 36;

  // Proportional sizing
  const outerBorder = size >= 40 ? 1.5 : 1;
  const svgStrokeWidth = size >= 60 ? 2.5 : size >= 36 ? 3 : 3.5;
  const topHeight = Math.max(4, Math.round(size * 0.28));
  const bottomHeight = Math.max(4, Math.round(size * 0.28));
  const midHeight = Math.max(6, size - topHeight - bottomHeight);
  const sideWidth = Math.max(4, Math.round(size * 0.28));

  const getZoneColors = (surface: ToothSurfaceCode) => {
    const isSelected = selectedSet.has(surface);
    return getSurfaceZoneColor(surface, effectiveConditions, isSelected);
  };

  const bColors = getZoneColors('B');
  const lColors = getZoneColors('L');
  const leftColors = getZoneColors(surfacesOrientation.left);
  const rightColors = getZoneColors(surfacesOrientation.right);
  const oColors = getZoneColors('O');

  const isMissing = effectiveConditions.some(
    (c) => c.status === 'Missing' && !c.isVoided && c.isCurrent !== false
  );
  const hasExtraction = effectiveConditions.some(
    (c) => c.status === 'ForExtraction' && !c.isVoided && c.isCurrent !== false
  );

  const renderSurfaceZone = (surface: ToothSurfaceCode, style: any) => {
    const isSelected = selectedSet.has(surface);
    const colors = getZoneColors(surface);

    return (
      <Pressable
        key={surface}
        accessibilityRole="button"
        accessibilityLabel={`Surface ${SURFACE_NAMES[surface]} (${surface}) surface-zone-${surface.toLowerCase()}`}
        accessibilityState={{ selected: isSelected }}
        disabled={!interactive || disabled}
        onPress={() => {
          if (interactive && !disabled) {
            onToggleSurface?.(surface);
          }
        }}
        testID={`surface-zone-${surface}`}
        {...({
          'data-testid': `surface-zone-${surface}`,
          'data-surface-zone': surface,
          'data-surface-lower': surface.toLowerCase(),
        } as any)}
        style={({ pressed }) => [
          style,
          styles.transparentHitZone,
          interactive && pressed && styles.zonePressed,
        ]}
      >
        {shouldShowLabels ? (
          <ThemedText
            variant="captionBold"
            color={colors.text}
            style={[styles.labelText, size >= 60 ? styles.labelLarge : styles.labelSmall]}
          >
            {surface}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.diagramContainer,
        {
          width: size,
          height: size,
          borderWidth: outerBorder,
          borderRadius: theme.radii.sm,
        },
        isMissing && styles.diagramMissing,
      ]}
      testID={testID}
      {...({ 'data-testid': testID } as any)}
    >
      {/* 5-Surface Angled Trapezoid SVG Schematic */}
      <Svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        {/* Top Trapezoid: Buccal / Labial (B) */}
        <Path
          d={TRAPEZOID_PATHS.top}
          fill={bColors.bg}
          stroke={bColors.border}
          strokeWidth={svgStrokeWidth}
          strokeLinejoin="round"
        />

        {/* Bottom Trapezoid: Lingual / Palatal (L) */}
        <Path
          d={TRAPEZOID_PATHS.bottom}
          fill={lColors.bg}
          stroke={lColors.border}
          strokeWidth={svgStrokeWidth}
          strokeLinejoin="round"
        />

        {/* Left Trapezoid: Mesial or Distal oriented to dental midline */}
        <Path
          d={TRAPEZOID_PATHS.left}
          fill={leftColors.bg}
          stroke={leftColors.border}
          strokeWidth={svgStrokeWidth}
          strokeLinejoin="round"
        />

        {/* Right Trapezoid: Distal or Mesial oriented to dental midline */}
        <Path
          d={TRAPEZOID_PATHS.right}
          fill={rightColors.bg}
          stroke={rightColors.border}
          strokeWidth={svgStrokeWidth}
          strokeLinejoin="round"
        />

        {/* Center Square: Occlusal / Incisal (O) */}
        <Rect
          x="28"
          y="28"
          width="44"
          height="44"
          rx="4"
          fill={oColors.bg}
          stroke={oColors.border}
          strokeWidth={svgStrokeWidth}
        />

        {/* Missing / Planned Extraction Cross Overlay */}
        {(isMissing || hasExtraction) && (
          <>
            <Line
              x1="14"
              y1="14"
              x2="86"
              y2="86"
              stroke={isMissing ? theme.colors.textMuted : theme.colors.emergency}
              strokeWidth={svgStrokeWidth + 0.5}
              strokeLinecap="round"
            />
            <Line
              x1="86"
              y1="14"
              x2="14"
              y2="86"
              stroke={isMissing ? theme.colors.textMuted : theme.colors.emergency}
              strokeWidth={svgStrokeWidth + 0.5}
              strokeLinecap="round"
            />
          </>
        )}
      </Svg>

      {/* Top Zone Hit Target: Buccal / Labial (B) */}
      {renderSurfaceZone('B', [styles.topZone, { height: topHeight }])}

      {/* Middle Row Hit Targets: Left (M or D), Center (O), Right (D or M) */}
      <View style={[styles.middleRow, { height: midHeight }]}>
        {renderSurfaceZone(surfacesOrientation.left, [styles.sideZone, { width: sideWidth }])}
        {renderSurfaceZone('O', styles.centerZone)}
        {renderSurfaceZone(surfacesOrientation.right, [styles.sideZone, { width: sideWidth }])}
      </View>

      {/* Bottom Zone Hit Target: Lingual / Palatal (L) */}
      {renderSurfaceZone('L', [styles.bottomZone, { height: bottomHeight }])}
    </View>
  );
}

const styles = StyleSheet.create({
  diagramContainer: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
    overflow: 'hidden',
    alignSelf: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  diagramMissing: {
    opacity: 0.55,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  transparentHitZone: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  topZone: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleRow: {
    width: '100%',
    flexDirection: 'row',
  },
  sideZone: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerZone: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomZone: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    textAlign: 'center',
    includeFontPadding: false,
  },
  labelSmall: {
    lineHeight: 12,
  },
  labelLarge: {
    lineHeight: 16,
  },
  zonePressed: {
    opacity: 0.7,
  },
});

export default ToothSurfaceDiagram;
