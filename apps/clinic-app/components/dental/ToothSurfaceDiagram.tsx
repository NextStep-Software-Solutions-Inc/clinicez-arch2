import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
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

export function ToothSurfaceDiagram({
  toothNumber,
  surfaces,
  status,
  conditions,
  size = 24,
  interactive = false,
  selectedSurfaces,
  onToggleSurface,
  disabled = false,
  showLabels,
  testID = 'tooth-surface-diagram',
}: ToothSurfaceDiagramProps) {
  const surfacesOrientation = getSurfacesForQuadrant(toothNumber);

  // Normalize effective conditions array
  const effectiveConditions = React.useMemo<ToothConditionItem[]>(() => {
    if (conditions && conditions.length > 0) {
      return conditions;
    }
    if (status || surfaces) {
      return [{ status: status || 'Healthy', surface: surfaces || '' }];
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
  const innerBorder = size >= 40 ? 1 : 0.5;
  const topHeight = Math.max(4, Math.round(size * 0.28));
  const bottomHeight = Math.max(4, Math.round(size * 0.28));
  const midHeight = Math.max(6, size - topHeight - bottomHeight);
  const sideWidth = Math.max(4, Math.round(size * 0.28));

  const renderSurfaceZone = (surface: ToothSurfaceCode, style: any) => {
    const isSelected = selectedSet.has(surface);
    const colors = getSurfaceZoneColor(surface, effectiveConditions, isSelected);

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
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: innerBorder,
          },
          interactive && isSelected && styles.zoneSelected,
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
      ]}
      testID={testID}
      {...({ 'data-testid': testID } as any)}
    >
      {/* Top Zone: Buccal / Labial (B) */}
      {renderSurfaceZone('B', [styles.topZone, { height: topHeight }])}

      {/* Middle Row: Left (M or D), Center (O), Right (D or M) */}
      <View style={[styles.middleRow, { height: midHeight }]}>
        {renderSurfaceZone(surfacesOrientation.left, [styles.sideZone, { width: sideWidth }])}
        {renderSurfaceZone('O', styles.centerZone)}
        {renderSurfaceZone(surfacesOrientation.right, [styles.sideZone, { width: sideWidth }])}
      </View>

      {/* Bottom Zone: Lingual / Palatal (L) */}
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
  zoneSelected: {
    borderColor: theme.colors.focusRing,
  },
  zonePressed: {
    opacity: 0.7,
  },
});

export default ToothSurfaceDiagram;
