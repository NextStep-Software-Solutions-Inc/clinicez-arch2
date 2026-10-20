import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  Pressable,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Svg, {
  Path,
  G,
} from 'react-native-svg';
import { lightColors } from '@clinicez/design-tokens';
import { theme } from '../../constants/theme';
import { AcuitySplit, VisitTypeSplit } from '../../services/clinicService';
import ThemedText from '../ui/ThemedText';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import SegmentedControl from '../ui/SegmentedControl';
import { useBreakpoint } from '../../utils/useBreakpoint';

export interface AcuityDonutChartProps {
  acuityData?: AcuitySplit | null;
  visitTypeData?: VisitTypeSplit | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export type BreakdownMode = 'acuity' | 'visitType';

interface SliceItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

function describeDonutSlice(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number
): string {
  if (endAngle - startAngle >= 2 * Math.PI - 0.001) {
    const midAngle = startAngle + Math.PI;
    const x0Out = cx + rOuter * Math.cos(startAngle);
    const y0Out = cy + rOuter * Math.sin(startAngle);
    const xMidOut = cx + rOuter * Math.cos(midAngle);
    const yMidOut = cy + rOuter * Math.sin(midAngle);
    const xMidIn = cx + rInner * Math.cos(midAngle);
    const yMidIn = cy + rInner * Math.sin(midAngle);
    const x0In = cx + rInner * Math.cos(startAngle);
    const y0In = cy + rInner * Math.sin(startAngle);

    return [
      `M ${x0Out.toFixed(1)} ${y0Out.toFixed(1)}`,
      `A ${rOuter.toFixed(1)} ${rOuter.toFixed(1)} 0 0 1 ${xMidOut.toFixed(1)} ${yMidOut.toFixed(1)}`,
      `A ${rOuter.toFixed(1)} ${rOuter.toFixed(1)} 0 0 1 ${x0Out.toFixed(1)} ${y0Out.toFixed(1)}`,
      `M ${x0In.toFixed(1)} ${y0In.toFixed(1)}`,
      `A ${rInner.toFixed(1)} ${rInner.toFixed(1)} 0 0 0 ${xMidIn.toFixed(1)} ${yMidIn.toFixed(1)}`,
      `A ${rInner.toFixed(1)} ${rInner.toFixed(1)} 0 0 0 ${x0In.toFixed(1)} ${y0In.toFixed(1)}`,
      'Z',
    ].join(' ');
  }

  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  const x0Out = cx + rOuter * Math.cos(startAngle);
  const y0Out = cy + rOuter * Math.sin(startAngle);
  const x1Out = cx + rOuter * Math.cos(endAngle);
  const y1Out = cy + rOuter * Math.sin(endAngle);
  const x1In = cx + rInner * Math.cos(endAngle);
  const y1In = cy + rInner * Math.sin(endAngle);
  const x0In = cx + rInner * Math.cos(startAngle);
  const y0In = cy + rInner * Math.sin(startAngle);

  return [
    `M ${x0Out.toFixed(1)} ${y0Out.toFixed(1)}`,
    `A ${rOuter.toFixed(1)} ${rOuter.toFixed(1)} 0 ${largeArcFlag} 1 ${x1Out.toFixed(1)} ${y1Out.toFixed(1)}`,
    `L ${x1In.toFixed(1)} ${y1In.toFixed(1)}`,
    `A ${rInner.toFixed(1)} ${rInner.toFixed(1)} 0 ${largeArcFlag} 0 ${x0In.toFixed(1)} ${y0In.toFixed(1)}`,
    'Z',
  ].join(' ');
}

export default function AcuityDonutChart({
  acuityData,
  visitTypeData,
  loading = false,
  error = null,
  onRetry,
  height,
  testID = 'acuity-donut-chart',
  style,
}: AcuityDonutChartProps) {
  const { isCompact } = useBreakpoint();
  const [mode, setMode] = useState<BreakdownMode>('acuity');
  const [activeSliceKey, setActiveSliceKey] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(440);

  const chartHeight = height ?? (isCompact ? 260 : 300);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - containerWidth) > 2) {
      setContainerWidth(w);
    }
  };

  // State 1: Loading
  if (loading) {
    return (
      <View testID={`${testID}-loading`} style={[styles.card, style]}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Skeleton width="45%" height={theme.fontSizes.lg} />
            <Skeleton width="65%" height={theme.fontSizes.xs} />
          </View>
        </View>
        <View style={[styles.contentRow, { height: chartHeight }]}>
          <View style={styles.donutPlaceholder}>
            <Skeleton width={180} height={180} radius={theme.radii.full} />
          </View>
        </View>
      </View>
    );
  }

  // State 2: Error
  if (error) {
    return (
      <View testID={`${testID}-error`} style={[styles.card, style]}>
        <ErrorState
          title="Unable to load operational distribution"
          message={error}
          onRetry={onRetry}
          retryLabel="Retry"
        />
      </View>
    );
  }

  // Build slices based on active mode
  let slices: SliceItem[] = [];
  if (mode === 'acuity') {
    slices = [
      {
        key: 'routine',
        label: 'Routine Priority',
        count: acuityData?.routineCount ?? 0,
        percentage: acuityData?.routinePercentage ?? 0,
        color: lightColors.routine,
      },
      {
        key: 'urgent',
        label: 'Urgent Triage',
        count: acuityData?.urgentCount ?? 0,
        percentage: acuityData?.urgentPercentage ?? 0,
        color: lightColors.urgent,
      },
      {
        key: 'emergency',
        label: 'Emergency Critical',
        count: acuityData?.emergencyCount ?? 0,
        percentage: acuityData?.emergencyPercentage ?? 0,
        color: lightColors.emergency,
      },
    ].filter(s => s.count > 0);
  } else {
    slices = [
      {
        key: 'walkIn',
        label: 'Walk-In Arrivals',
        count: visitTypeData?.walkInCount ?? 0,
        percentage: visitTypeData?.walkInPercentage ?? 0,
        color: lightColors.primary,
      },
      {
        key: 'appointment',
        label: 'Booked Appointments',
        count: visitTypeData?.appointmentCount ?? 0,
        percentage: visitTypeData?.appointmentPercentage ?? 0,
        color: lightColors.info,
      },
    ].filter(s => s.count > 0);
  }

  const totalPatients = slices.reduce((sum, s) => sum + s.count, 0);

  // State 3: Empty
  if (totalPatients === 0) {
    return (
      <View testID={`${testID}-empty`} style={[styles.card, style]}>
        <View style={styles.header}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Triage &amp; Visit Flow Distribution
          </ThemedText>
        </View>
        <EmptyState
          icon="queue"
          title="No Visit Telemetry"
          description="Acuity and visit distribution metrics will appear when visits are logged for this period."
          actionTitle={onRetry ? 'Refresh' : undefined}
          onAction={onRetry}
        />
      </View>
    );
  }

  // State 4: Active
  // Layout math
  const donutSize = Math.min(isCompact ? 180 : 200, containerWidth * 0.45);
  const cx = donutSize / 2;
  const cy = donutSize / 2;
  const rOuter = donutSize / 2 - 8;
  const rInner = rOuter * 0.58;

  // Build arc geometry
  let curAngle = -Math.PI / 2;
  const arcSlices = slices.map(s => {
    const fraction = totalPatients > 0 ? s.count / totalPatients : 0;
    const sweep = fraction * 2 * Math.PI;
    const startAngle = curAngle;
    const endAngle = curAngle + sweep;
    curAngle = endAngle;

    const isActive = activeSliceKey === s.key;
    const pathD = describeDonutSlice(
      cx,
      cy,
      isActive ? rInner - 3 : rInner,
      isActive ? rOuter + 4 : rOuter,
      startAngle,
      endAngle
    );

    return {
      ...s,
      pathD,
      isActive,
    };
  });

  const activeSlice = slices.find(s => s.key === activeSliceKey);

  return (
    <View testID={`${testID}-active`} style={[styles.card, style]} onLayout={handleLayout}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Triage &amp; Visit Flow Distribution
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Breakdown by clinical triage priority and visit channel
          </ThemedText>
        </View>
        <SegmentedControl
          options={[
            { value: 'acuity', label: 'Triage Acuity' },
            { value: 'visitType', label: 'Visit Channel' },
          ]}
          value={mode}
          onChange={val => {
            setMode(val as BreakdownMode);
            setActiveSliceKey(null);
          }}
        />
      </View>

      <View style={styles.contentRow}>
        {/* SVG Donut */}
        <View style={[styles.donutWrapper, { width: donutSize, height: donutSize }]}>
          <Svg width={donutSize} height={donutSize}>
            <G>
              {arcSlices.map(slice => (
                <Path
                  key={`acuity-slice-${slice.key}`}
                  d={slice.pathD}
                  fill={slice.color}
                  opacity={activeSliceKey && !slice.isActive ? 0.45 : 1}
                  onPress={() => setActiveSliceKey(slice.isActive ? null : slice.key)}
                />
              ))}
            </G>
          </Svg>

          {/* Center Cutout KPI */}
          <View style={styles.centerHole} pointerEvents="none">
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {activeSlice ? activeSlice.label.split(' ')[0] : 'Total'}
            </ThemedText>
            <ThemedText variant="h2" color={theme.colors.text}>
              {activeSlice ? `${activeSlice.percentage.toFixed(0)}%` : totalPatients}
            </ThemedText>
          </View>
        </View>

        {/* Legend & Breakdown List */}
        <View style={styles.legendContainer}>
          {slices.map(s => {
            const isSelected = activeSliceKey === s.key;
            return (
              <Pressable
                key={`legend-${s.key}`}
                style={[styles.legendItem, isSelected && styles.legendItemSelected]}
                onPress={() => setActiveSliceKey(isSelected ? null : s.key)}
                accessibilityRole="button"
                accessibilityLabel={`${s.label}: ${s.count} patients, ${s.percentage.toFixed(1)}%`}
              >
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <View style={styles.legendTextWrap}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {s.label}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {s.count} patients • {s.percentage.toFixed(1)}%
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  titleGroup: {
    gap: 2,
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  donutWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerHole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  legendContainer: {
    flex: 1,
    minWidth: 200,
    gap: theme.spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: 'transparent',
  },
  legendItemSelected: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.primary,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radii.full,
  },
  legendTextWrap: {
    flex: 1,
    gap: 1,
  },
});
