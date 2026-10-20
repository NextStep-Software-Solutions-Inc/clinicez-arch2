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
import { HourlyFlowPoint } from '../../services/clinicService';
import ThemedText from '../ui/ThemedText';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useBreakpoint } from '../../utils/useBreakpoint';

export interface HourlyFlowBarChartProps {
  data?: HourlyFlowPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export default function HourlyFlowBarChart({
  data = [],
  loading = false,
  error = null,
  onRetry,
  height,
  testID = 'hourly-flow-bar-chart',
  style,
}: HourlyFlowBarChartProps) {
  const { isCompact } = useBreakpoint();
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(560);

  const chartHeight = height ?? (isCompact ? 220 : 260);

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
        <View style={[styles.chartContainer, { height: chartHeight }]}>
          <View style={styles.skeletonBarsRow}>
            {[30, 60, 95, 80, 50, 45, 70, 85, 60, 40, 25, 15].map((h, i) => (
              <Skeleton
                key={`skel-hourly-${i}`}
                width={theme.sizes.controlSm}
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
          title="Unable to load hourly arrival flow"
          message={error}
          onRetry={onRetry}
          retryLabel="Retry"
        />
      </View>
    );
  }

  // State 3: Empty
  const totalCheckIns = (data || []).reduce((sum, d) => sum + (d.checkInCount || 0), 0);
  if (!data || data.length === 0 || totalCheckIns === 0) {
    return (
      <View testID={`${testID}-empty`} style={[styles.card, style]}>
        <View style={styles.header}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Peak Arrival Flow (Hourly Inflow)
          </ThemedText>
        </View>
        <EmptyState
          icon="time"
          title="No Arrival Telemetry"
          description="Patient check-in arrival velocity will populate once patients queue during operating hours."
          actionTitle={onRetry ? 'Refresh' : undefined}
          onAction={onRetry}
        />
      </View>
    );
  }

  // State 4: Active
  const maxCount = Math.max(...data.map(d => d.checkInCount), 1);
  const peakItem = data.reduce((max, d) => (d.checkInCount > max.checkInCount ? d : max), data[0]);

  // Layout math
  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 28;
  const paddingBottom = 32;

  const plotWidth = Math.max(containerWidth - paddingLeft - paddingRight, 100);
  const plotHeight = Math.max(chartHeight - paddingTop - paddingBottom, 50);

  const numBars = data.length;
  const slotWidth = plotWidth / numBars;
  const barWidth = Math.max(Math.min(slotWidth * 0.72, 34), 10);

  // Y-axis ticks
  const yTicks = [0, Math.ceil(maxCount * 0.5), maxCount];

  const activeItem = activeBarIndex !== null ? data[activeBarIndex] : null;

  return (
    <View testID={`${testID}-active`} style={[styles.card, style]} onLayout={handleLayout}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Peak Arrival Flow (Hourly Inflow)
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Distribution of patient queue arrivals across operating hours
          </ThemedText>
        </View>
        <View style={styles.kpiPillsRow}>
          <View style={styles.kpiPill}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Peak Hour:
            </ThemedText>
            <ThemedText variant="captionBold" color={theme.colors.primary}>
              {peakItem?.hourLabel} ({peakItem?.checkInCount} pts)
            </ThemedText>
          </View>
          <View style={styles.kpiPill}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Total Inflow:
            </ThemedText>
            <ThemedText variant="captionBold" color={theme.colors.text}>
              {totalCheckIns}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Interactive Tooltip Card */}
      <View style={styles.tooltipContainer}>
        {activeItem ? (
          <View style={styles.activeTooltipBox}>
            <View style={styles.tooltipDot} />
            <ThemedText variant="captionBold" color={theme.colors.text}>
              {activeItem.hourLabel} Window:
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              {activeItem.checkInCount} check-in{activeItem.checkInCount === 1 ? '' : 's'} (
              {activeItem.percentage.toFixed(1)}% of total)
            </ThemedText>
          </View>
        ) : (
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Tap or hover a bar to inspect hourly patient arrival density
          </ThemedText>
        )}
      </View>

      {/* SVG Canvas */}
      <View style={[styles.chartContainer, { height: chartHeight }]}>
        <Svg width={containerWidth} height={chartHeight}>
          {/* Horizontal Gridlines & Y-labels */}
          {yTicks.map((val, idx) => {
            const y = paddingTop + plotHeight - (val / maxCount) * plotHeight;
            return (
              <G key={`hourly-grid-${idx}`}>
                <Line
                  x1={paddingLeft}
                  y1={y}
                  x2={containerWidth - paddingRight}
                  y2={y}
                  stroke={theme.colors.borderLight}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <SvgText
                  x={paddingLeft - 8}
                  y={y + 4}
                  fill={theme.colors.textMuted}
                  fontSize={theme.fontSizes.xs}
                  textAnchor="end"
                >
                  {val}
                </SvgText>
              </G>
            );
          })}

          {/* Hourly Bars */}
          {data.map((item, idx) => {
            const cx = paddingLeft + idx * slotWidth + slotWidth / 2;
            const barHeight = Math.max((item.checkInCount / maxCount) * plotHeight, 3);
            const y = paddingTop + plotHeight - barHeight;
            const isPeak = item.hour === peakItem.hour && item.checkInCount > 0;
            const isActive = activeBarIndex === idx;

            const fillColor = isPeak
              ? lightColors.primary
              : isActive
              ? lightColors.primaryHover
              : lightColors.routine;

            return (
              <G key={`hourly-bar-${item.hour}-${idx}`}>
                <Rect
                  x={cx - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  ry={3}
                  fill={fillColor}
                  opacity={isActive ? 1 : 0.85}
                />

                {/* X-axis hour label */}
                <SvgText
                  x={cx}
                  y={chartHeight - 10}
                  fill={isActive ? theme.colors.primary : theme.colors.textSecondary}
                  fontSize={theme.fontSizes.xs}
                  fontWeight={isActive || isPeak ? 'bold' : 'normal'}
                  textAnchor="middle"
                >
                  {item.hourLabel}
                </SvgText>

                {/* Value on top of peak or active bar */}
                {(isPeak || isActive) && item.checkInCount > 0 && (
                  <SvgText
                    x={cx}
                    y={y - 6}
                    fill={isPeak ? theme.colors.primary : theme.colors.text}
                    fontSize={theme.fontSizes.xs}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {item.checkInCount}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>

        {/* Touch overlay overlay slots */}
        <View style={[StyleSheet.absoluteFill, { left: paddingLeft, right: paddingRight, top: paddingTop, bottom: paddingBottom }, styles.touchOverlayRow]}>
          {data.map((item, idx) => (
            <Pressable
              key={`touch-slot-${idx}`}
              style={styles.touchSlot}
              accessibilityRole="button"
              accessibilityLabel={`${item.hourLabel}: ${item.checkInCount} check-ins, ${item.percentage.toFixed(1)}%`}
              onPress={() => setActiveBarIndex(activeBarIndex === idx ? null : idx)}
            />
          ))}
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
  kpiPillsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  kpiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  tooltipContainer: {
    minHeight: 24,
    justifyContent: 'center',
  },
  activeTooltipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    alignSelf: 'flex-start',
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  chartContainer: {
    position: 'relative',
    width: '100%',
  },
  touchOverlayRow: {
    flexDirection: 'row',
  },
  touchSlot: {
    flex: 1,
    height: '100%',
  },
  skeletonBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
});
