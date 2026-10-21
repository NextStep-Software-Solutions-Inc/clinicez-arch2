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
import { TenderShare } from '../../services/clinicService';
import ThemedText from '../ui/ThemedText';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useBreakpoint } from '../../utils/useBreakpoint';

export interface TenderDonutChartProps {
  data: TenderShare[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const formatPeso = (value: number | undefined | null): string => {
  const num = Number(value) || 0;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const getTenderColor = (method: string): string => {
  const normalized = (method || '').replace(/[\s_-]+/g, '').toLowerCase();
  if (normalized.includes('cash') && !normalized.includes('gcash')) {
    return lightColors.success;
  }
  if (normalized.includes('gcash')) {
    return lightColors.info;
  }
  if (normalized.includes('maya')) {
    return lightColors.purple;
  }
  if (normalized.includes('credit')) {
    return lightColors.warning;
  }
  if (normalized.includes('debit')) {
    return lightColors.urgent;
  }
  if (normalized.includes('philhealth') || normalized.includes('konsulta')) {
    return lightColors.routine;
  }
  if (normalized.includes('hmo') || normalized.includes('insurance')) {
    return lightColors.primaryDark;
  }
  return lightColors.primary;
};

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

export default function TenderDonutChart({
  data = [],
  loading = false,
  error = null,
  onRetry,
  height,
  testID = 'tender-donut-chart',
  style,
}: TenderDonutChartProps) {
  const { isCompact } = useBreakpoint();
  const [activeSliceIndex, setActiveSliceIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(560);

  const chartHeight = height ?? (isCompact ? 280 : 320);

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
            <Skeleton width="60%" height={theme.fontSizes.xs} />
          </View>
        </View>
        <View style={[styles.chartContainer, { height: chartHeight }]}>
          <Skeleton
            width={isCompact ? 160 : 200}
            height={isCompact ? 160 : 200}
            radius={theme.radii.full}
          />
        </View>
      </View>
    );
  }

  // State 2: Error
  if (error) {
    return (
      <View testID={`${testID}-error`} style={[styles.card, style]}>
        <ErrorState
          title="Unable to load payment methods"
          message={error}
          onRetry={onRetry}
          retryLabel="Retry"
        />
      </View>
    );
  }

  // State 3: Empty
  const totalCollections = data.reduce(
    (sum, item) => sum + (Number(item.totalAmount) || 0),
    0
  );

  if (!data || data.length === 0 || totalCollections <= 0) {
    return (
      <View testID={`${testID}-empty`} style={[styles.card, style]}>
        <EmptyState
          icon="creditCard"
          title="No Collections Recorded"
          description="No collections or payments recorded in this period"
          actionTitle={onRetry ? 'Refresh' : undefined}
          onAction={onRetry}
        />
      </View>
    );
  }

  // State 4: Active Data
  const validItems = data.filter((item) => (Number(item.totalAmount) || 0) > 0);

  // SVG Geometry
  const svgSize = Math.min(chartHeight, isCompact ? containerWidth : 260);
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const rOuter = svgSize * 0.42;
  const rInner = svgSize * 0.26;

  let currentAngle = -Math.PI / 2;
  const slices = validItems.map((item, index) => {
    const amount = Number(item.totalAmount) || 0;
    const fraction = totalCollections > 0 ? amount / totalCollections : 0;
    const angleDelta = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleDelta;
    const midAngle = startAngle + angleDelta / 2;
    currentAngle = endAngle;

    const isActive = activeSliceIndex === index;
    const offset = isActive ? 6 : 0;
    const sliceCx = cx + Math.cos(midAngle) * offset;
    const sliceCy = cy + Math.sin(midAngle) * offset;
    const color = getTenderColor(item.method);

    const path = describeDonutSlice(
      sliceCx,
      sliceCy,
      rInner,
      isActive ? rOuter + 4 : rOuter,
      startAngle,
      endAngle
    );

    return {
      item,
      index,
      color,
      path,
      fraction,
      percentage: item.percentage || fraction * 100,
      isActive,
    };
  });

  const activeSlice =
    activeSliceIndex !== null && slices[activeSliceIndex]
      ? slices[activeSliceIndex]
      : null;

  return (
    <View
      testID={testID}
      style={[styles.card, style]}
      onLayout={handleLayout}
      accessibilityRole="summary"
      accessibilityLabel="Payment tender methods distribution donut chart"
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Payment Methods
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Tender share and PhilHealth coverage distribution
          </ThemedText>
        </View>
      </View>

      <View
        style={[
          styles.contentLayout,
          isCompact ? styles.contentLayoutCompact : styles.contentLayoutWide,
        ]}
      >
        {/* SVG Donut with Center Cutout KPI */}
        <View style={[styles.donutWrapper, { width: svgSize, height: svgSize }]}>
          <Svg width={svgSize} height={svgSize}>
            <G>
              {slices.map((s) => (
                <Path
                  key={`slice-${s.index}`}
                  d={s.path}
                  fill={s.color}
                  stroke={lightColors.surface}
                  strokeWidth={2}
                  onPress={() => setActiveSliceIndex(s.index)}
                  onPressIn={() => setActiveSliceIndex(s.index)}
                />
              ))}
            </G>
          </Svg>

          {/* Center Cutout KPI Callout */}
          <View
            style={[
              styles.centerKpi,
              {
                width: rInner * 2 - 4,
                height: rInner * 2 - 4,
                borderRadius: theme.radii.full,
              },
            ]}
            pointerEvents="none"
          >
            {activeSlice ? (
              <View style={styles.kpiInner} testID={`${testID}-highlight`}>
                <ThemedText
                  variant="captionBold"
                  color={activeSlice.color}
                  numberOfLines={1}
                >
                  {activeSlice.item.method}
                </ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text} numberOfLines={1}>
                  {formatPeso(activeSlice.item.totalAmount)}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {activeSlice.percentage.toFixed(1)}%
                </ThemedText>
              </View>
            ) : (
              <View style={styles.kpiInner} testID={`${testID}-total`}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Total
                </ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text} numberOfLines={1}>
                  {formatPeso(totalCollections)}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Collections
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Interactive Legend Pills */}
        <View style={styles.legendContainer}>
          {slices.map((s) => (
            <Pressable
              key={`legend-${s.index}`}
              testID={`tender-legend-${s.index}`}
              style={[
                styles.legendPill,
                s.isActive && styles.legendPillActive,
              ]}
              onPress={() =>
                setActiveSliceIndex(s.isActive ? null : s.index)
              }
              onHoverIn={() => setActiveSliceIndex(s.index)}
              onHoverOut={() => setActiveSliceIndex(null)}
            >
              <View
                style={[
                  styles.legendColorDot,
                  { backgroundColor: s.color },
                ]}
              />
              <View style={styles.legendTextCol}>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {s.item.method}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {formatPeso(s.item.totalAmount)} ({s.percentage.toFixed(1)}%)
                </ThemedText>
              </View>
            </Pressable>
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
    padding: theme.spacing.xl,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  titleGroup: {
    gap: theme.spacing.xs,
  },
  chartContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentLayout: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xl,
  },
  contentLayoutCompact: {
    flexDirection: 'column',
  },
  contentLayoutWide: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  donutWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerKpi: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
    padding: theme.spacing.xs,
  },
  kpiInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  legendContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: theme.spacing.sm,
    minWidth: 200,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  legendPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  legendColorDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radii.full,
  },
  legendTextCol: {
    flex: 1,
    gap: 1,
  },
});
