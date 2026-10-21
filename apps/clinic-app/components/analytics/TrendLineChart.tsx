import React, { useState, useId } from 'react';
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
  Circle,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Text as SvgText,
  G,
} from 'react-native-svg';
import { lightColors } from '@clinicez/design-tokens';
import { theme } from '../../constants/theme';
import { DailyTrendPoint } from '../../services/clinicService';
import ThemedText from '../ui/ThemedText';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useBreakpoint } from '../../utils/useBreakpoint';

export type TrendMetric = 'revenue' | 'volume';

export interface TrendLineChartProps {
  data: DailyTrendPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  initialMetric?: TrendMetric;
}

export const formatPeso = (value: number | undefined | null): string => {
  const num = Number(value) || 0;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatVolume = (value: number | undefined | null): string => {
  const num = Number(value) || 0;
  return `${num.toLocaleString('en-PH')} Visits`;
};

const METRIC_OPTIONS: { value: TrendMetric; label: string }[] = [
  { value: 'revenue', label: 'Revenue (₱)' },
  { value: 'volume', label: 'Patient Volume (Visits)' },
];

export default function TrendLineChart({
  data = [],
  loading = false,
  error = null,
  onRetry,
  height,
  testID = 'trend-line-chart',
  style,
  initialMetric = 'revenue',
}: TrendLineChartProps) {
  const { isCompact } = useBreakpoint();
  const [selectedMetric, setSelectedMetric] = useState<TrendMetric>(initialMetric);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(560);
  const gradientId = useId().replace(/:/g, '_') + '_trendGradient';

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
            <Skeleton width="40%" height={theme.fontSizes.lg} />
            <Skeleton width="60%" height={theme.fontSizes.xs} />
          </View>
          <Skeleton width="35%" height={theme.sizes.controlSm} radius={theme.radii.md} />
        </View>
        <View style={[styles.chartContainer, { height: chartHeight }]}>
          <Skeleton width="100%" height={chartHeight} radius={theme.radii.md} />
        </View>
      </View>
    );
  }

  // State 2: Error
  if (error) {
    return (
      <View testID={`${testID}-error`} style={[styles.card, style]}>
        <ErrorState
          title="Unable to load trend chart"
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
          icon="calendar"
          title="No Trend Data"
          description="No revenue or visits recorded in this date range"
          actionTitle={onRetry ? 'Refresh' : undefined}
          onAction={onRetry}
        />
      </View>
    );
  }

  // State 4: Active Data
  const paddingLeft = isCompact ? 54 : 68;
  const paddingRight = 20;
  const paddingTop = 24;
  const paddingBottom = 40;

  const chartWidth = Math.max(260, containerWidth);
  const plotWidth = Math.max(10, chartWidth - paddingLeft - paddingRight);
  const plotHeight = Math.max(10, chartHeight - paddingTop - paddingBottom);
  const bottomY = paddingTop + plotHeight;

  const values = data.map((d) =>
    selectedMetric === 'revenue' ? Number(d.revenue) || 0 : Number(d.patientCount) || 0
  );

  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const effectiveMax = rawMax > 0 ? rawMax : selectedMetric === 'revenue' ? 1000 : 10;
  const effectiveMin = rawMin < 0 ? rawMin : 0;
  const valueRange = Math.max(1, effectiveMax - effectiveMin);

  const points = data.map((d, index) => {
    const val = selectedMetric === 'revenue' ? Number(d.revenue) || 0 : Number(d.patientCount) || 0;
    const x =
      data.length > 1
        ? paddingLeft + (index / (data.length - 1)) * plotWidth
        : paddingLeft + plotWidth / 2;
    const y = paddingTop + plotHeight - ((val - effectiveMin) / valueRange) * plotHeight;
    return { x, y, val, item: d, index };
  });

  // Line & Area Path strings
  let linePath = '';
  let areaPath = '';
  if (points.length === 1) {
    const p = points[0];
    linePath = `M ${paddingLeft} ${p.y} L ${paddingLeft + plotWidth} ${p.y}`;
    areaPath = `M ${paddingLeft} ${bottomY} L ${paddingLeft} ${p.y} L ${paddingLeft + plotWidth} ${p.y} L ${paddingLeft + plotWidth} ${bottomY} Z`;
  } else if (points.length > 1) {
    linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`;
  }

  // Horizontal Grid Ticks (4 ticks)
  const gridTicks = [0, 0.33, 0.66, 1].map((ratio) => {
    const val = effectiveMin + ratio * valueRange;
    const y = paddingTop + plotHeight - ratio * plotHeight;
    let label = '';
    if (selectedMetric === 'revenue') {
      if (val >= 1000000) label = `₱${(val / 1000000).toFixed(1)}M`;
      else if (val >= 1000) label = `₱${Math.round(val / 1000)}k`;
      else label = `₱${Math.round(val)}`;
    } else {
      label = `${Math.round(val)}`;
    }
    return { val, y, label };
  });

  // Visible X Axis Labels
  const step = data.length > 12 ? Math.ceil(data.length / 6) : 1;
  const visibleXIndices = new Set<number>();
  for (let i = 0; i < data.length; i += step) {
    visibleXIndices.add(i);
  }
  visibleXIndices.add(data.length - 1);

  const activePoint =
    activePointIndex !== null && points[activePointIndex]
      ? points[activePointIndex]
      : null;

  return (
    <View
      testID={testID}
      style={[styles.card, style]}
      onLayout={handleLayout}
      accessibilityRole="summary"
      accessibilityLabel={`Trend chart for ${selectedMetric === 'revenue' ? 'revenue' : 'patient volume'}`}
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Operational Trend
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Longitudinal revenue and consultation volume
          </ThemedText>
        </View>
        <SegmentedControl
          options={METRIC_OPTIONS}
          value={selectedMetric}
          onChange={(m) => {
            setSelectedMetric(m);
            setActivePointIndex(null);
          }}
        />
      </View>

      <View style={[styles.chartContainer, { height: chartHeight }]}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lightColors.primaryLight} stopOpacity="0.85" />
              <Stop offset="100%" stopColor={lightColors.primaryLight} stopOpacity="0.05" />
            </LinearGradient>
          </Defs>

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

          {/* Area Fill */}
          {areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}

          {/* Trend Line */}
          {linePath ? (
            <Path
              d={linePath}
              fill="none"
              stroke={lightColors.primary}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Active Crosshair Guideline */}
          {activePoint ? (
            <Line
              x1={activePoint.x}
              y1={paddingTop}
              x2={activePoint.x}
              y2={bottomY}
              stroke={lightColors.primary}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ) : null}

          {/* Circles for Data Points */}
          {points.map((p) => {
            const isActive = activePointIndex === p.index;
            return (
              <Circle
                key={`point-${p.index}`}
                cx={p.x}
                cy={p.y}
                r={isActive ? 7 : 4}
                fill={isActive ? lightColors.primaryDark : lightColors.surface}
                stroke={lightColors.primary}
                strokeWidth={isActive ? 2 : 1.5}
              />
            );
          })}

          {/* X-Axis Date Labels */}
          {points.map((p) => {
            if (!visibleXIndices.has(p.index)) return null;
            return (
              <SvgText
                key={`date-${p.index}`}
                x={p.x}
                y={chartHeight - paddingBottom + 20}
                textAnchor="middle"
                fill={lightColors.textMuted}
                fontSize={theme.fontSizes.xs}
              >
                {p.item.dateLabel}
              </SvgText>
            );
          })}

          {/* Invisible Interactive Hit Targets */}
          {points.map((p) => {
            const hitWidth =
              points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
            const hitX = Math.max(paddingLeft, p.x - hitWidth / 2);
            return (
              <Rect
                key={`hit-${p.index}`}
                x={hitX}
                y={paddingTop}
                width={Math.max(20, hitWidth)}
                height={plotHeight + paddingBottom}
                fill={lightColors.transparent}
                onPress={() => setActivePointIndex(p.index)}
                onPressIn={() => setActivePointIndex(p.index)}
              />
            );
          })}
        </Svg>

        {/* Hover / Touch Target Overlay for Web & Touch */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {points.map((p) => {
            const hitWidth =
              points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
            const hitX = Math.max(paddingLeft, p.x - hitWidth / 2);
            return (
              <Pressable
                key={`touch-overlay-${p.index}`}
                testID={`trend-point-${p.index}`}
                style={[
                  styles.hitBox,
                  {
                    left: hitX,
                    top: paddingTop,
                    width: Math.max(20, hitWidth),
                    height: plotHeight + paddingBottom,
                  },
                ]}
                onPress={() => setActivePointIndex(p.index)}
                onHoverIn={() => setActivePointIndex(p.index)}
                onHoverOut={() => setActivePointIndex(null)}
              />
            );
          })}
        </View>

        {/* Interactive Tooltip Callout */}
        {activePoint ? (
          <View
            testID={`${testID}-tooltip`}
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                left: Math.min(
                  chartWidth - 140,
                  Math.max(paddingLeft, activePoint.x - 60)
                ),
                top: Math.max(4, activePoint.y - 56),
              },
            ]}
          >
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {activePoint.item.dateLabel}
            </ThemedText>
            <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
              {selectedMetric === 'revenue'
                ? formatPeso(activePoint.item.revenue)
                : formatVolume(activePoint.item.patientCount)}
            </ThemedText>
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
    alignItems: 'center',
    minWidth: 100,
  },
});
