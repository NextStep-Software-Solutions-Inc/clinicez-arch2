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
  Rect,
  Line,
  Text as SvgText,
  G,
} from 'react-native-svg';
import { lightColors } from '@clinicez/design-tokens';
import { theme } from '../../constants/theme';
import { DoctorStat } from '../../services/clinicService';
import ThemedText from '../ui/ThemedText';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useBreakpoint } from '../../utils/useBreakpoint';

export type WorkloadMetric = 'encounters' | 'billed';

export interface WorkloadBarChartProps {
  data: DoctorStat[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  initialMetric?: WorkloadMetric;
}

export const formatPeso = (value: number | undefined | null): string => {
  const num = Number(value) || 0;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const METRIC_OPTIONS: { value: WorkloadMetric; label: string }[] = [
  { value: 'encounters', label: 'Patient Encounters' },
  { value: 'billed', label: 'Total Billed (₱)' },
];

export default function WorkloadBarChart({
  data = [],
  loading = false,
  error = null,
  onRetry,
  height,
  testID = 'workload-bar-chart',
  style,
  initialMetric = 'encounters',
}: WorkloadBarChartProps) {
  const { isCompact } = useBreakpoint();
  const [selectedMetric, setSelectedMetric] = useState<WorkloadMetric>(initialMetric);
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(560);

  const chartHeight = height ?? (isCompact ? 240 : 300);

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
          <Skeleton width="40%" height={theme.sizes.controlSm} radius={theme.radii.md} />
        </View>
        <View style={[styles.chartContainer, { height: chartHeight }]}>
          <View style={styles.skeletonBarsRow}>
            {[40, 75, 55, 90, 60].map((h, i) => (
              <Skeleton
                key={`skel-bar-${i}`}
                width={theme.sizes.controlLg}
                height={Math.round((chartHeight * h) / 100)}
                radius={theme.radii.xs}
              />
            ))}
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
          title="Unable to load clinician workload"
          message={error}
          onRetry={onRetry}
          retryLabel="Retry"
        />
      </View>
    );
  }

  // State 3: Empty
  if (!data || data.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={[styles.card, style]}>
        <EmptyState
          icon="stethoscope"
          title="No Clinician Workload"
          description="No consultations logged by clinicians in this period"
          actionTitle={onRetry ? 'Refresh' : undefined}
          onAction={onRetry}
        />
      </View>
    );
  }

  // State 4: Active Data
  const paddingLeft = isCompact ? 54 : 68;
  const paddingRight = 20;
  const paddingTop = 32;
  const paddingBottom = 48;

  const chartWidth = Math.max(260, containerWidth);
  const plotWidth = Math.max(10, chartWidth - paddingLeft - paddingRight);
  const plotHeight = Math.max(10, chartHeight - paddingTop - paddingBottom);
  const bottomY = paddingTop + plotHeight;

  const metricValues = data.map((d) =>
    selectedMetric === 'encounters'
      ? Number(d.encountersCount) || 0
      : Number(d.totalBilled) || 0
  );

  const rawMax = Math.max(...metricValues, 0);
  const effectiveMax = rawMax > 0 ? rawMax : selectedMetric === 'billed' ? 5000 : 10;

  // Horizontal Grid Ticks (4 ticks)
  const gridTicks = [0, 0.33, 0.66, 1].map((ratio) => {
    const val = ratio * effectiveMax;
    const y = paddingTop + plotHeight - ratio * plotHeight;
    let label = '';
    if (selectedMetric === 'billed') {
      if (val >= 1000000) label = `₱${(val / 1000000).toFixed(1)}M`;
      else if (val >= 1000) label = `₱${Math.round(val / 1000)}k`;
      else label = `₱${Math.round(val)}`;
    } else {
      label = `${Math.round(val)}`;
    }
    return { val, y, label };
  });

  const slotWidth = plotWidth / data.length;
  const barWidth = Math.min(48, Math.max(16, slotWidth * 0.58));

  const bars = data.map((d, index) => {
    const val =
      selectedMetric === 'encounters'
        ? Number(d.encountersCount) || 0
        : Number(d.totalBilled) || 0;
    const barHeight = effectiveMax > 0 ? (val / effectiveMax) * plotHeight : 0;
    const x = paddingLeft + (index + 0.5) * slotWidth - barWidth / 2;
    const y = bottomY - barHeight;
    const avgRevenue =
      (d.encountersCount || 0) > 0
        ? (d.totalBilled || 0) / d.encountersCount
        : 0;

    let displayVal = '';
    if (selectedMetric === 'billed') {
      if (val >= 1000000) displayVal = `₱${(val / 1000000).toFixed(1)}M`;
      else if (val >= 1000) displayVal = `₱${Math.round(val / 1000)}k`;
      else displayVal = `₱${Math.round(val)}`;
    } else {
      displayVal = `${val}`;
    }

    const shortName =
      d.doctorName.length > 12
        ? `${d.doctorName.slice(0, 11)}…`
        : d.doctorName;

    return {
      index,
      item: d,
      val,
      barHeight,
      x,
      y,
      slotX: paddingLeft + index * slotWidth,
      slotWidth,
      avgRevenue,
      displayVal,
      shortName,
    };
  });

  const activeBar =
    activeBarIndex !== null && bars[activeBarIndex]
      ? bars[activeBarIndex]
      : null;

  return (
    <View
      testID={testID}
      style={[styles.card, style]}
      onLayout={handleLayout}
      accessibilityRole="summary"
      accessibilityLabel={`Workload bar chart for ${selectedMetric === 'encounters' ? 'encounters' : 'billing'}`}
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Clinician Workload
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Consultation throughput and revenue attribution
          </ThemedText>
        </View>
        <SegmentedControl
          options={METRIC_OPTIONS}
          value={selectedMetric}
          onChange={(m) => {
            setSelectedMetric(m);
            setActiveBarIndex(null);
          }}
        />
      </View>

      <View style={[styles.chartContainer, { height: chartHeight }]}>
        <Svg width={chartWidth} height={chartHeight}>
          {/* Gridlines & Y-Axis Labels */}
          {gridTicks.map((tick, i) => (
            <G key={`grid-${i}`}>
              <Line
                x1={paddingLeft}
                y1={tick.y}
                x2={paddingLeft + plotWidth}
                y2={tick.y}
                stroke={lightColors.borderLight}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <SvgText
                x={paddingLeft - 8}
                y={tick.y + 4}
                textAnchor="end"
                fill={lightColors.textMuted}
                fontSize={theme.fontSizes.xs}
              >
                {tick.label}
              </SvgText>
            </G>
          ))}

          {/* Baseline */}
          <Line
            x1={paddingLeft}
            y1={bottomY}
            x2={paddingLeft + plotWidth}
            y2={bottomY}
            stroke={lightColors.border}
            strokeWidth={1}
          />

          {/* Bars */}
          {bars.map((b) => {
            const isActive = activeBarIndex === b.index;
            return (
              <G key={`bar-${b.index}`}>
                <Rect
                  x={b.x}
                  y={b.y}
                  width={barWidth}
                  height={Math.max(2, b.barHeight)}
                  rx={theme.radii.xs}
                  ry={theme.radii.xs}
                  fill={isActive ? lightColors.primaryDark : lightColors.primary}
                />
                {b.barHeight > 10 ? (
                  <SvgText
                    x={b.x + barWidth / 2}
                    y={b.y - 6}
                    textAnchor="middle"
                    fill={lightColors.textSecondary}
                    fontSize={theme.fontSizes.xs}
                    fontWeight="600"
                  >
                    {b.displayVal}
                  </SvgText>
                ) : null}
                <SvgText
                  x={b.x + barWidth / 2}
                  y={bottomY + 18}
                  textAnchor="middle"
                  fill={lightColors.text}
                  fontSize={theme.fontSizes.xs}
                >
                  {b.shortName}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* Hover / Touch Target Overlay for Web & Touch */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {bars.map((b) => (
            <Pressable
              key={`touch-bar-${b.index}`}
              testID={`workload-bar-${b.index}`}
              style={[
                styles.hitBox,
                {
                  left: b.slotX,
                  top: paddingTop,
                  width: b.slotWidth,
                  height: plotHeight + paddingBottom,
                },
              ]}
              onPress={() => setActiveBarIndex(b.index)}
              onHoverIn={() => setActiveBarIndex(b.index)}
              onHoverOut={() => setActiveBarIndex(null)}
            />
          ))}
        </View>

        {/* Interactive Tooltip Callout */}
        {activeBar ? (
          <View
            testID={`${testID}-tooltip`}
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                left: Math.min(
                  chartWidth - 190,
                  Math.max(paddingLeft, activeBar.x + barWidth / 2 - 90)
                ),
                top: Math.max(4, activeBar.y - 82),
              },
            ]}
          >
            <ThemedText variant="smallBold" color={theme.colors.text}>
              {activeBar.item.doctorName}
            </ThemedText>
            <View style={styles.tooltipMetrics}>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Encounters: {activeBar.item.encountersCount} Visits
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Billed: {formatPeso(activeBar.item.totalBilled)}
              </ThemedText>
              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                Avg / Visit: {formatPeso(activeBar.avgRevenue)}
              </ThemedText>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  titleGroup: {
    gap: theme.spacing.xs,
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    width: '100%',
    height: '100%',
    paddingHorizontal: theme.spacing['2xl'],
    paddingBottom: theme.spacing['2xl'],
  },
  hitBox: {
    position: 'absolute',
    backgroundColor: theme.colors.transparent,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    ...theme.shadows.md,
    alignItems: 'flex-start',
    minWidth: 170,
  },
  tooltipMetrics: {
    marginTop: theme.spacing.xs,
    gap: 2,
  },
});
