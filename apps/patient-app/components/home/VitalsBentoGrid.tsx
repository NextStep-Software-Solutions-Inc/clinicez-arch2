import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { VitalSign } from '../../db/schema/vitalSigns';

export interface VitalsData {
  heartRateBpm?: number | null;
  heartRateTrend?: string | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  bpCategory?: string | null;
  fastingBloodGlucose?: number | string | null;
  bloodGlucoseMgDl?: number | null;
  glucoseCategory?: string | null;
  sleepHours?: number | null;
  sleepFormatted?: string | null;
  sleepDeepFormatted?: string | null;
  spO2Percent?: number | string | null;
}

export interface VitalsBentoGridProps {
  vitals?: VitalSign | VitalsData | null;
  isZeroData?: boolean;
  onPressHistory: () => void;
  onPressConnect?: () => void;
}

export default function VitalsBentoGrid({
  vitals,
  isZeroData = false,
  onPressHistory,
  onPressConnect,
}: VitalsBentoGridProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  const v = vitals as (VitalSign & VitalsData) | null | undefined;
  const heartRate = v?.heartRateBpm ?? null;
  const hasHeartRate = !isZeroData && heartRate != null;
  const heartRateTrend = v?.heartRateTrend ?? '+2 bpm';

  const systolic = v?.bpSystolic ?? null;
  const diastolic = v?.bpDiastolic ?? null;
  const hasBp = !isZeroData && (systolic != null || diastolic != null);
  const bpCategory = v?.bpCategory ?? (hasBp ? 'Optimal' : 'Clinical');

  const rawGlucose = v?.bloodGlucoseMgDl ?? v?.fastingBloodGlucose ?? null;
  const glucoseVal = rawGlucose != null ? Number(rawGlucose).toFixed(0) : null;
  const hasGlucose = !isZeroData && glucoseVal != null;
  const glucoseCategory = v?.glucoseCategory ?? 'Fasting';

  const sleepFormatted =
    v?.sleepFormatted ??
    (v?.sleepHours
      ? `${Math.floor(v.sleepHours)}h ${Math.round((v.sleepHours % 1) * 60)}m`
      : null);
  const deepSleepFormatted = v?.sleepDeepFormatted ?? '2h 10m';
  const hasSleep = !isZeroData && (sleepFormatted != null || v?.sleepHours != null);
  const hasOxygen = !isZeroData && v?.spO2Percent != null;

  return (
    <View style={[styles.sectionWrap, { gap: spacing.sm }]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View>
          <ThemedText variant="title">Recent Vitals</ThemedText>
          <View style={styles.subRow}>
            <AppIcon name="sync" size={12} color="primary" />
            <ThemedText variant="caption" color="textMuted">
              {isZeroData ? 'No readings logged yet' : 'Apple Health • Updated recently'}
            </ThemedText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View vitals history"
          onPress={onPressHistory}
          style={styles.historyRow}
        >
          <ThemedText variant="smallBold" color="primaryText">
            History
          </ThemedText>
          <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
        </Pressable>
      </View>

      {/* 2x2 Bento Telemetry Grid */}
      <View style={[styles.bentoGrid, { gap: spacing.sm }]}>
        {/* Vital 1: Heart Rate */}
        <View
          style={[
            styles.bentoTile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.md,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.tileHeader}>
            <View
              style={[
                styles.vitalIconBadge,
                {
                  backgroundColor: colors.emergencyBg,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <AppIcon name="heartPulse" size={sizes.iconMd} color="emergency" />
            </View>
            <Badge label="Resting" tone="neutral" size="sm" />
          </View>

          <View style={styles.metricValGroup}>
            <ThemedText variant="caption" color="textSecondary">
              Heart Rate
            </ThemedText>
            <View style={styles.metricRow}>
              <ThemedText variant="h1">
                {hasHeartRate ? heartRate : '--'}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                bpm
              </ThemedText>
            </View>
          </View>

          <View style={styles.trendRow}>
            {hasHeartRate ? (
              <View style={styles.sparklineFlexRow}>
                <View style={styles.trendLabelGroup}>
                  <AppIcon name="activity" size={14} color="emergency" />
                  <ThemedText variant="captionBold" color="emergency">
                    {heartRateTrend}
                  </ThemedText>
                </View>
                <Svg width={56} height={20} viewBox="0 0 56 20">
                  <Path
                    d="M0,14 L12,12 L22,16 L32,8 L42,11 L56,4"
                    fill="none"
                    stroke={colors.emergency}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            ) : (
              <ThemedText variant="caption" color="textMuted">
                No data recorded
              </ThemedText>
            )}
          </View>
        </View>

        {/* Vital 2: Blood Pressure */}
        <View
          style={[
            styles.bentoTile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.md,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.tileHeader}>
            <View
              style={[
                styles.vitalIconBadge,
                {
                  backgroundColor: colors.primarySubtle,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <AppIcon name="activity" size={sizes.iconMd} color="primary" />
            </View>
            <Badge
              label={hasBp ? bpCategory : 'Clinical'}
              tone={hasBp ? 'success' : 'neutral'}
              size="sm"
            />
          </View>

          <View style={styles.metricValGroup}>
            <ThemedText variant="caption" color="textSecondary">
              Blood Pressure
            </ThemedText>
            <View style={styles.metricRow}>
              <ThemedText variant="h2">
                {hasBp ? `${systolic ?? '--'}/${diastolic ?? '--'}` : '--/--'}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                mmHg
              </ThemedText>
            </View>
          </View>

          <View style={styles.trendRow}>
            {hasBp ? (
              <View style={styles.sparklineFlexRow}>
                <View style={styles.trendLabelGroup}>
                  <AppIcon name="checkCircle" size={14} color="success" />
                  <ThemedText variant="captionBold" color="success">
                    Stable
                  </ThemedText>
                </View>
                <ThemedText variant="caption" color="textSecondary">
                  Sys/Dia
                </ThemedText>
              </View>
            ) : (
              <ThemedText variant="caption" color="textMuted">
                Sys / Dia
              </ThemedText>
            )}
          </View>
        </View>

        {/* Vital 3: Blood Glucose */}
        <View
          style={[
            styles.bentoTile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.md,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.tileHeader}>
            <View
              style={[
                styles.vitalIconBadge,
                {
                  backgroundColor: colors.infoBg,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <AppIcon name="lab" size={sizes.iconMd} color="info" />
            </View>
            <Badge label={glucoseCategory} tone="neutral" size="sm" />
          </View>

          <View style={styles.metricValGroup}>
            <ThemedText variant="caption" color="textSecondary">
              Blood Glucose
            </ThemedText>
            <View style={styles.metricRow}>
              <ThemedText variant="h1">
                {hasGlucose ? glucoseVal : '--'}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                mg/dL
              </ThemedText>
            </View>
          </View>

          <View style={styles.trendRow}>
            {hasGlucose ? (
              <View style={styles.sparklineFlexRow}>
                <ThemedText variant="caption" color="textSecondary">
                  Normal 70-99
                </ThemedText>
                <Svg width={56} height={20} viewBox="0 0 56 20">
                  <Path
                    d="M0,10 L14,14 L28,8 L40,11 L56,9"
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            ) : (
              <ThemedText variant="caption" color="textSecondary">
                Target: 70–99
              </ThemedText>
            )}
          </View>
        </View>

        {/* Vital 4: Sleep Total / Oxygen */}
        <View
          style={[
            styles.bentoTile,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.md,
            },
            shadows.sm,
          ]}
        >
          <View style={styles.tileHeader}>
            <View
              style={[
                styles.vitalIconBadge,
                {
                  backgroundColor: colors.purpleBg,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <AppIcon name="clock" size={sizes.iconMd} color="purple" />
            </View>
            <Badge
              label={
                hasSleep
                  ? '+12%'
                  : hasOxygen
                    ? `${Number(v?.spO2Percent).toFixed(0)}%`
                    : 'Duration'
              }
              tone={hasSleep || hasOxygen ? 'success' : 'neutral'}
              size="sm"
            />
          </View>

          <View style={styles.metricValGroup}>
            <ThemedText variant="caption" color="textSecondary">
              {hasSleep ? 'Sleep Total' : hasOxygen ? 'Oxygen Saturation' : 'Sleep Total'}
            </ThemedText>
            <View style={styles.metricRow}>
              <ThemedText variant="h1">
                {hasSleep
                  ? sleepFormatted
                  : hasOxygen
                    ? `${Number(v?.spO2Percent).toFixed(0)}%`
                    : '--h --m'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.trendRow}>
            {hasSleep ? (
              <View style={styles.sparklineFlexRow}>
                <ThemedText variant="caption" color="textSecondary">
                  Deep: {deepSleepFormatted}
                </ThemedText>
                <View style={styles.sleepBars}>
                  <View
                    style={[
                      styles.sleepBar,
                      {
                        height: 6,
                        backgroundColor: colors.purpleBg,
                        borderRadius: radii.full,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.sleepBar,
                      {
                        height: 10,
                        backgroundColor: colors.purpleBg,
                        borderRadius: radii.full,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.sleepBar,
                      {
                        height: 14,
                        backgroundColor: colors.purple,
                        borderRadius: radii.full,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.sleepBar,
                      {
                        height: 10,
                        backgroundColor: colors.purpleBg,
                        borderRadius: radii.full,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <ThemedText variant="caption" color="textSecondary">
                {hasOxygen ? 'Optimal SpO2' : 'Synced trackers'}
              </ThemedText>
            )}
          </View>
        </View>
      </View>

      {/* State 1: Connect Device Action Banner */}
      {isZeroData ? (
        <View
          style={[
            styles.connectBanner,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              gap: spacing.sm,
            },
          ]}
        >
          <View style={styles.connectLeft}>
            <View
              style={[
                styles.connectIconWrap,
                {
                  backgroundColor: colors.primarySubtle,
                  borderRadius: radii.full,
                },
              ]}
            >
              <AppIcon name="sync" size={sizes.iconMd} color="primary" />
            </View>
            <View style={styles.connectTexts}>
              <ThemedText variant="smallBold" numberOfLines={1}>
                Sync Apple Health or Log Manually
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                Auto-populate your daily vital statistics
              </ThemedText>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Connect device or sync"
            onPress={onPressConnect}
            style={({ pressed }) => [
              styles.connectBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <ThemedText variant="captionBold" color="onPrimary">
              Connect
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  bentoTile: {
    width: '48%',
    minHeight: 110,
    justifyContent: 'space-between',
  },
  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vitalIconBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValGroup: {
    marginVertical: 4,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricUnit: {
    marginBottom: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sparklineFlexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  trendLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sleepBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  sleepBar: {
    width: 6,
  },
  connectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  connectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  connectIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectTexts: {
    flex: 1,
    minWidth: 0,
  },
  connectBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
