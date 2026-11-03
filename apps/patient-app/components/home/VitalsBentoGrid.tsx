import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { VitalSign } from '../../db/schema/vitalSigns';

export interface VitalsBentoGridProps {
  vitals?: VitalSign | null;
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

  const hasHeartRate = !isZeroData && vitals?.heartRateBpm != null;
  const hasBp = !isZeroData && (vitals?.bpSystolic != null || vitals?.bpDiastolic != null);
  const hasGlucose = !isZeroData && vitals?.fastingBloodGlucose != null;
  const hasOxygen = !isZeroData && vitals?.spO2Percent != null;

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
                {hasHeartRate ? vitals!.heartRateBpm : '--'}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                bpm
              </ThemedText>
            </View>
          </View>

          <View style={styles.trendRow}>
            {hasHeartRate ? (
              <>
                <AppIcon name="activity" size={14} color="emergency" />
                <ThemedText variant="captionBold" color="emergency">
                  Active
                </ThemedText>
              </>
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
              label={hasBp ? 'Optimal' : 'Clinical'}
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
                {hasBp
                  ? `${vitals!.bpSystolic ?? '--'}/${vitals!.bpDiastolic ?? '--'}`
                  : '--/--'}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                mmHg
              </ThemedText>
            </View>
          </View>

          <View style={styles.trendRow}>
            {hasBp ? (
              <>
                <AppIcon name="checkCircle" size={14} color="success" />
                <ThemedText variant="captionBold" color="success">
                  Stable • Sys/Dia
                </ThemedText>
              </>
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
            <Badge label="Fasting" tone="neutral" size="sm" />
          </View>

          <View style={styles.metricValGroup}>
            <ThemedText variant="caption" color="textSecondary">
              Blood Glucose
            </ThemedText>
            <View style={styles.metricRow}>
              <ThemedText variant="h1">
                {hasGlucose ? Number(vitals!.fastingBloodGlucose).toFixed(0) : '--'}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                mg/dL
              </ThemedText>
            </View>
          </View>

          <View style={styles.trendRow}>
            <ThemedText variant="caption" color="textSecondary">
              Target: 70–99
            </ThemedText>
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
              label={hasOxygen ? `${Number(vitals!.spO2Percent).toFixed(0)}%` : 'Trackers'}
              tone={hasOxygen ? 'success' : 'neutral'}
              size="sm"
            />
          </View>

          <View style={styles.metricValGroup}>
            <ThemedText variant="caption" color="textSecondary">
              {hasOxygen ? 'Oxygen Saturation' : 'Sleep Total'}
            </ThemedText>
            <View style={styles.metricRow}>
              <ThemedText variant="h1">
                {hasOxygen
                  ? `${Number(vitals!.spO2Percent).toFixed(0)}%`
                  : '--'}
              </ThemedText>
              {!hasOxygen ? (
                <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                  h m
                </ThemedText>
              ) : null}
            </View>
          </View>

          <View style={styles.trendRow}>
            <ThemedText variant="caption" color="textSecondary">
              {hasOxygen ? 'Optimal SpO2' : 'Synced trackers'}
            </ThemedText>
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
