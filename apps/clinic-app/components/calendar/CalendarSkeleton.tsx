import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { theme } from '../../constants/theme';
import type { CalendarViewMode } from './types';

export interface CalendarSkeletonProps {
  viewMode?: CalendarViewMode;
}

export function CalendarSkeleton({ viewMode = 'month' }: CalendarSkeletonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 750,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 750,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View
      data-testid="calendar-skeleton"
      testID="calendar-skeleton"
      accessibilityRole="progressbar"
      aria-busy={true}
      style={styles.container}
    >
      <View
        data-testid="skeleton-header"
        testID="skeleton-header"
        style={styles.header}
      >
        <Animated.View style={[styles.headerBlock, { opacity: pulseAnim }]} />
      </View>

      <View
        data-testid="skeleton-grid"
        testID="skeleton-grid"
        style={styles.gridContainer}
      >
        {viewMode === 'month' && (
          <View style={styles.monthGrid}>
            {Array.from({ length: 35 }).map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.monthCell,
                  { opacity: pulseAnim },
                ]}
              />
            ))}
          </View>
        )}

        {viewMode === 'week' && (
          <View style={styles.weekGrid}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.weekCol,
                  { opacity: pulseAnim },
                ]}
              />
            ))}
          </View>
        )}

        {viewMode === 'day' && (
          <View style={styles.dayGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.dayCol,
                  { opacity: pulseAnim },
                ]}
              />
            ))}
          </View>
        )}

        {viewMode === 'agenda' && (
          <View style={styles.agendaList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.agendaRow,
                  { opacity: pulseAnim },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.skeletonBase,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
  },
  header: {
    height: theme.sizes.controlLg,
    backgroundColor: theme.colors.skeletonHighlight,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.md,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  headerBlock: {
    width: '40%',
    height: theme.spacing.md,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.sm,
  },
  gridContainer: {
    minHeight: 320,
    backgroundColor: theme.colors.skeletonHighlight,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  monthCell: {
    width: '13.5%',
    height: 56,
    backgroundColor: theme.colors.skeletonBase,
    borderRadius: theme.radii.sm,
  },
  weekGrid: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    height: 300,
  },
  weekCol: {
    flex: 1,
    height: '100%',
    backgroundColor: theme.colors.skeletonBase,
    borderRadius: theme.radii.sm,
  },
  dayGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    height: 300,
  },
  dayCol: {
    flex: 1,
    height: '100%',
    backgroundColor: theme.colors.skeletonBase,
    borderRadius: theme.radii.sm,
  },
  agendaList: {
    gap: theme.spacing.sm,
  },
  agendaRow: {
    height: 48,
    backgroundColor: theme.colors.skeletonBase,
    borderRadius: theme.radii.md,
  },
});

export default CalendarSkeleton;
