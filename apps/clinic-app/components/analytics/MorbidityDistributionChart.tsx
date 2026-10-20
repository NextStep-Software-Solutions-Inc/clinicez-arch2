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
  G,
} from 'react-native-svg';
import { lightColors } from '@clinicez/design-tokens';
import { theme } from '../../constants/theme';
import { MorbidityItem, MorbidityDiseaseRow } from '../../services/clinicService';
import ThemedText from '../ui/ThemedText';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';

export type DemographicFilter = 'all' | 'pediatric' | 'adult' | 'senior';

export interface MorbidityDistributionChartProps {
  data: (MorbidityItem | MorbidityDiseaseRow)[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  initialCohort?: DemographicFilter;
}

const COHORT_OPTIONS: { value: DemographicFilter; label: string }[] = [
  { value: 'all', label: 'All Cases' },
  { value: 'pediatric', label: 'Pediatric (<18y)' },
  { value: 'adult', label: 'Adult (18-59y)' },
  { value: 'senior', label: 'Senior (60+y)' },
];

export default function MorbidityDistributionChart({
  data = [],
  loading = false,
  error = null,
  onRetry,
  testID = 'morbidity-distribution-chart',
  style,
  initialCohort = 'all',
}: MorbidityDistributionChartProps) {
  const [selectedCohort, setSelectedCohort] = useState<DemographicFilter>(initialCohort);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(560);

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
          <Skeleton width="50%" height={theme.sizes.controlSm} radius={theme.radii.md} />
        </View>
        <View style={styles.skeletonRows}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={`skel-row-${i}`} style={styles.skeletonRowItem}>
              <Skeleton width="30%" height={theme.fontSizes.sm} />
              <Skeleton width="100%" height={theme.sizes.iconMd} radius={theme.radii.xs} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // State 2: Error
  if (error) {
    return (
      <View testID={`${testID}-error`} style={[styles.card, style]}>
        <ErrorState
          title="Unable to load morbidity distribution"
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
          title="No Morbidity Data"
          description="No diagnoses recorded in this period"
          actionTitle={onRetry ? 'Refresh' : undefined}
          onAction={onRetry}
        />
      </View>
    );
  }

  // Normalize data items
  const normalizedItems = data.map((item, index) => {
    const totalCases =
      'totalCases' in item && typeof item.totalCases === 'number'
        ? item.totalCases
        : 'caseCount' in item && typeof item.caseCount === 'number'
        ? item.caseCount
        : 0;

    const pediatricCases =
      'pediatricCases' in item && typeof item.pediatricCases === 'number'
        ? item.pediatricCases
        : 0;

    const adultCases =
      'adultCases' in item && typeof item.adultCases === 'number'
        ? item.adultCases
        : 0;

    const seniorCases =
      'seniorCases' in item && typeof item.seniorCases === 'number'
        ? item.seniorCases
        : 0;

    const maleCases =
      'maleCases' in item && typeof item.maleCases === 'number'
        ? item.maleCases
        : undefined;

    const femaleCases =
      'femaleCases' in item && typeof item.femaleCases === 'number'
        ? item.femaleCases
        : undefined;

    const percentage =
      'percentageOfTotal' in item && typeof item.percentageOfTotal === 'number'
        ? item.percentageOfTotal
        : 'percentageShare' in item && typeof item.percentageShare === 'number'
        ? item.percentageShare
        : 0;

    const hasDemographics =
      'pediatricCases' in item || 'adultCases' in item || 'seniorCases' in item;

    return {
      index,
      rawItem: item,
      icd10Code: item.icd10Code || '',
      description: item.description || '',
      totalCases,
      pediatricCases,
      adultCases,
      seniorCases,
      maleCases,
      femaleCases,
      percentage,
      hasDemographics,
    };
  });

  // Calculate cohort count for sorting
  const rowsWithCohort = normalizedItems.map((item) => {
    let cohortCount = item.totalCases;
    if (selectedCohort === 'pediatric') {
      cohortCount = item.hasDemographics ? item.pediatricCases : item.totalCases;
    } else if (selectedCohort === 'adult') {
      cohortCount = item.hasDemographics ? item.adultCases : item.totalCases;
    } else if (selectedCohort === 'senior') {
      cohortCount = item.hasDemographics ? item.seniorCases : item.totalCases;
    }
    return { ...item, cohortCount };
  });

  // Sort descending by cohort count, take top 10
  const sortedRows = [...rowsWithCohort]
    .sort((a, b) => b.cohortCount - a.cohortCount)
    .slice(0, 10);

  const maxCohortCount = Math.max(...sortedRows.map((r) => r.cohortCount), 1);
  const barAreaWidth = Math.max(120, containerWidth - 140);

  const activeRow =
    activeRowIndex !== null && sortedRows[activeRowIndex]
      ? sortedRows[activeRowIndex]
      : null;

  return (
    <View
      testID={testID}
      style={[styles.card, style]}
      onLayout={handleLayout}
      accessibilityRole="summary"
      accessibilityLabel="Morbidity and disease distribution chart"
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <ThemedText variant="h3" color={theme.colors.text}>
            Morbidity Distribution
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Statutory ICD-10 disease burden and age demographics
          </ThemedText>
        </View>
        <SegmentedControl
          options={COHORT_OPTIONS}
          value={selectedCohort}
          onChange={(c) => {
            setSelectedCohort(c);
            setActiveRowIndex(null);
          }}
        />
      </View>

      {/* Demographic Legend Pills */}
      {selectedCohort === 'all' ? (
        <View style={styles.demographicLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: lightColors.info }]} />
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Pediatric (&lt;18y)
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: lightColors.primary }]} />
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Adult (18-59y)
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: lightColors.warning }]} />
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Senior (60+y)
            </ThemedText>
          </View>
        </View>
      ) : null}

      {/* Disease Distribution Rows */}
      <View style={styles.listContainer}>
        {sortedRows.map((row, idx) => {
          const isActive = activeRowIndex === idx;

          // Demographic sub-bars calculation
          const pWidth =
            row.hasDemographics && maxCohortCount > 0
              ? (row.pediatricCases / maxCohortCount) * barAreaWidth
              : 0;
          const aWidth =
            row.hasDemographics && maxCohortCount > 0
              ? (row.adultCases / maxCohortCount) * barAreaWidth
              : 0;
          const sWidth =
            row.hasDemographics && maxCohortCount > 0
              ? (row.seniorCases / maxCohortCount) * barAreaWidth
              : 0;
          const singleWidth =
            maxCohortCount > 0
              ? (row.cohortCount / maxCohortCount) * barAreaWidth
              : 0;

          let cohortColor: string = lightColors.primary;
          if (selectedCohort === 'pediatric') cohortColor = lightColors.info;
          else if (selectedCohort === 'senior') cohortColor = lightColors.warning;

          return (
            <Pressable
              key={`morbidity-row-${row.icd10Code}-${idx}`}
              testID={`morbidity-row-${idx}`}
              style={[styles.rowCard, isActive && styles.rowCardActive]}
              onPress={() => setActiveRowIndex(isActive ? null : idx)}
              onHoverIn={() => setActiveRowIndex(idx)}
              onHoverOut={() => setActiveRowIndex(null)}
            >
              {/* Row Header: Code Badge + Description */}
              <View style={styles.rowHeader}>
                <View style={styles.codeBadge}>
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                    {row.icd10Code}
                  </ThemedText>
                </View>
                <ThemedText
                  variant="smallBold"
                  color={theme.colors.text}
                  numberOfLines={1}
                  style={styles.descriptionText}
                >
                  {row.description}
                </ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                  {row.cohortCount} ({row.percentage.toFixed(1)}%)
                </ThemedText>
              </View>

              {/* Horizontal SVG Bar */}
              <View style={styles.barWrapper}>
                <Svg width={barAreaWidth} height={16}>
                  {/* Background Track */}
                  <Rect
                    x={0}
                    y={1}
                    width={barAreaWidth}
                    height={14}
                    rx={theme.radii.xs}
                    fill={lightColors.surfaceSubtle}
                  />

                  {/* Colored Bar */}
                  {selectedCohort === 'all' && row.hasDemographics ? (
                    <G>
                      {pWidth > 0 ? (
                        <Rect
                          x={0}
                          y={1}
                          width={Math.max(2, pWidth)}
                          height={14}
                          rx={theme.radii.xs}
                          fill={lightColors.info}
                        />
                      ) : null}
                      {aWidth > 0 ? (
                        <Rect
                          x={pWidth}
                          y={1}
                          width={Math.max(2, aWidth)}
                          height={14}
                          fill={lightColors.primary}
                        />
                      ) : null}
                      {sWidth > 0 ? (
                        <Rect
                          x={pWidth + aWidth}
                          y={1}
                          width={Math.max(2, sWidth)}
                          height={14}
                          rx={theme.radii.xs}
                          fill={lightColors.warning}
                        />
                      ) : null}
                    </G>
                  ) : (
                    <Rect
                      x={0}
                      y={1}
                      width={Math.max(2, singleWidth)}
                      height={14}
                      rx={theme.radii.xs}
                      fill={isActive ? lightColors.primaryDark : cohortColor}
                    />
                  )}
                </Svg>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Tooltip Card for Active Item */}
      {activeRow ? (
        <View testID={`${testID}-tooltip`} style={styles.tooltipCard}>
          <View style={styles.tooltipHeader}>
            <View style={styles.codeBadge}>
              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                {activeRow.icd10Code}
              </ThemedText>
            </View>
            <ThemedText variant="smallBold" color={theme.colors.text} style={styles.flex1}>
              {activeRow.description}
            </ThemedText>
          </View>
          <View style={styles.tooltipMetricsRow}>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Total: {activeRow.totalCases} cases ({activeRow.percentage.toFixed(1)}% of all cases)
            </ThemedText>
            {activeRow.hasDemographics ? (
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Pediatric: {activeRow.pediatricCases} • Adult: {activeRow.adultCases} • Senior: {activeRow.seniorCases}
              </ThemedText>
            ) : null}
            {activeRow.maleCases !== undefined && activeRow.femaleCases !== undefined ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Male: {activeRow.maleCases} • Female: {activeRow.femaleCases}
              </ThemedText>
            ) : null}
          </View>
        </View>
      ) : null}
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
    marginBottom: theme.spacing.md,
  },
  titleGroup: {
    gap: theme.spacing.xs,
  },
  skeletonRows: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  skeletonRowItem: {
    gap: theme.spacing.xs,
  },
  demographicLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
  },
  listContainer: {
    gap: theme.spacing.sm,
  },
  rowCard: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  rowCardActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  codeBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
  },
  descriptionText: {
    flex: 1,
  },
  barWrapper: {
    width: '100%',
    alignItems: 'flex-start',
  },
  tooltipCard: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    ...theme.shadows.sm,
    gap: theme.spacing.xs,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tooltipMetricsRow: {
    gap: 2,
    paddingLeft: theme.spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
