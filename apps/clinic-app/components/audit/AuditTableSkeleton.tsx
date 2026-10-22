import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';

export interface AuditTableSkeletonProps {
  rows?: number;
}

export function AuditTableSkeleton({ rows = 8 }: AuditTableSkeletonProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading audit trail"
      style={styles.container}
    >
      {/* Header Placeholder */}
      <View style={styles.headerRow}>
        <ThemedText style={styles.headerPlaceholderText}>Loading audit entries...</ThemedText>
      </View>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={[styles.row, index % 2 === 1 && styles.rowEven]}>
          {/* Timestamp */}
          <Animated.View style={[styles.cellTimestamp, styles.placeholder, { opacity }]} />
          {/* Category */}
          <Animated.View style={[styles.cellCategory, styles.placeholder, { opacity }]} />
          {/* Severity */}
          <Animated.View style={[styles.cellSeverity, styles.placeholder, { opacity }]} />
          {/* Action */}
          <Animated.View style={[styles.cellAction, styles.placeholder, { opacity }]} />
          {/* Actor */}
          <Animated.View style={[styles.cellActor, styles.placeholder, { opacity }]} />
          {/* Target */}
          <Animated.View style={[styles.cellTarget, styles.placeholder, { opacity }]} />
          {/* Patient */}
          <Animated.View style={[styles.cellPatient, styles.placeholder, { opacity }]} />
          {/* Outcome */}
          <Animated.View style={[styles.cellOutcome, styles.placeholder, { opacity }]} />
          {/* Inspect */}
          <Animated.View style={[styles.cellInspect, styles.placeholder, { opacity }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  headerRow: {
    backgroundColor: theme.colors.surfaceMuted,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    width: '100%',
  },
  headerPlaceholderText: {
    color: theme.colors.textMuted,
    ...theme.typography.captionBold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  rowEven: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  placeholder: {
    backgroundColor: theme.colors.skeletonBase,
    height: theme.spacing.md,
    borderRadius: theme.radii.sm,
  },
  cellTimestamp: {
    width: 140,
    flexShrink: 0,
  },
  cellCategory: {
    width: 90,
    flexShrink: 0,
  },
  cellSeverity: {
    width: 70,
    flexShrink: 0,
  },
  cellAction: {
    flex: 2.5,
    minWidth: 160,
  },
  cellActor: {
    flex: 1.5,
    minWidth: 130,
  },
  cellTarget: {
    flex: 2,
    minWidth: 110,
  },
  cellPatient: {
    flex: 1.5,
    minWidth: 110,
  },
  cellOutcome: {
    width: 70,
    flexShrink: 0,
  },
  cellInspect: {
    width: 60,
    flexShrink: 0,
  },
});
export default AuditTableSkeleton;
