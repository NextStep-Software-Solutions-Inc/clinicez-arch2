import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { HomeRecentVitalsDto, VitalSparklinePointDto } from '../../services/api/homeApi';

export interface RecentVitalsGridProps {
  vitals: HomeRecentVitalsDto;
  onHistoryPress: () => void;
  onConnectOrLogPress: () => void;
}

function buildPolylinePoints(series: VitalSparklinePointDto[], width = 56, height = 20): string {
  const values = series.map((s) => Number(s.value)).filter((n) => Number.isFinite(n));
  if (values.length === 0) return '';
  if (values.length === 1) {
    const midY = (height / 2).toFixed(1);
    return `2,${midY} ${width - 2},${midY}`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((val, idx) => {
      const x = 2 + (idx / (values.length - 1)) * (width - 4);
      const y = height - 3 - ((val - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function formatDurationParts(totalMinutes: number | null): { hours: string; mins: string } | null {
  if (totalMinutes == null || totalMinutes <= 0) return null;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return { hours: String(h), mins: String(m).padStart(2, '0') };
}

function formatDeepSleepLabel(deepMinutes: number | null): string {
  if (deepMinutes == null || deepMinutes <= 0) return 'Restorative sleep';
  const h = Math.floor(deepMinutes / 60);
  const m = deepMinutes % 60;
  return `Deep: ${h}h ${m}m`;
}

function MiniLineSparkline({
  series,
  strokeColor,
}: {
  series: VitalSparklinePointDto[];
  strokeColor: string;
}) {
  const points = useMemo(() => buildPolylinePoints(series, 56, 20), [series]);
  if (!points) return null;
  return (
    <Svg width={56} height={20} viewBox="0 0 56 20">
      <Polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MiniSleepBars({
  series,
  mutedColor,
  activeColor,
}: {
  series: VitalSparklinePointDto[];
  mutedColor: string;
  activeColor: string;
}) {
  const bars = useMemo(() => {
    const raw = series.slice(-4).map((p) => Number(p.value));
    if (raw.length === 0) return [];
    const max = Math.max(...raw, 480);
    return raw.map((v) => Math.max(6, Math.round((v / max) * 18)));
  }, [series]);

  if (bars.length === 0) return null;

  return (
    <Svg width={44} height={20} viewBox="0 0 44 20">
      {bars.map((barHeight, idx) => {
        const isRecent = idx >= bars.length - 2;
        return (
          <Rect
            key={idx}
            x={idx * 11 + 2}
            y={20 - barHeight}
            width={7}
            height={barHeight}
            rx={2.5}
            fill={isRecent ? activeColor : mutedColor}
          />
        );
      })}
    </Svg>
  );
}

function RecentVitalsGridComponent({
  vitals,
  onHistoryPress,
  onConnectOrLogPress,
}: RecentVitalsGridProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  const updatedSubtitle = useMemo(() => {
    if (!vitals.hasAnyReadings) return 'No readings logged yet';
    const src = vitals.lastSource ?? 'Synced Vitals';
    if (!vitals.lastRecordedAt) return `${src} • Updated recently`;
    try {
      const rel = formatDistanceToNow(parseISO(vitals.lastRecordedAt), { addSuffix: true });
      return `${src} • Updated ${rel}`;
    } catch {
      return `${src} • Updated recently`;
    }
  }, [vitals.hasAnyReadings, vitals.lastRecordedAt, vitals.lastSource]);

  const sleepParts = useMemo(
    () => formatDurationParts(vitals.sleepDurationMinutes),
    [vitals.sleepDurationMinutes],
  );

  const hasHr = vitals.heartRateBpm != null;
  const hasBp = vitals.systolicBp != null && vitals.diastolicBp != null;
  const hasGlucose = vitals.fastingBloodGlucoseMgDl != null;
  const hasSleep = sleepParts != null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.headerWrap}>
        <View style={styles.headerTopRow}>
          <Text style={[typography.headlineSm, { color: colors.navyText }]}>Recent Vitals</Text>
          <Pressable
            onPress={vitals.hasAnyReadings ? onHistoryPress : onConnectOrLogPress}
            accessibilityRole="button"
            accessibilityLabel={vitals.hasAnyReadings ? 'View Vitals History' : 'Log Vitals'}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerAction,
              { gap: spacing.xxs, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <Text style={[typography.labelMd, { color: colors.primary }]}>
              {vitals.hasAnyReadings ? 'History' : 'Learn More'}
            </Text>
            <AppIcon name="forward" size={14} color={colors.primary} />
          </Pressable>
        </View>

        <View style={[styles.subHeaderRow, { gap: spacing.xs, marginTop: spacing.xxs }]}>
          <AppIcon
            name={vitals.hasAnyReadings ? 'sync' : 'info'}
            size={13}
            color={vitals.hasAnyReadings ? colors.primary : colors.mutedText}
          />
          <Text style={[typography.bodySm, { color: colors.bodyText }]}>{updatedSubtitle}</Text>
        </View>
      </View>

      <View style={[styles.bentoGrid, { gap: spacing.md }]}>
        <View style={[styles.bentoRow, { gap: spacing.md }]}>
          {/* 1. Heart Rate */}
          <Pressable
            onPress={vitals.hasAnyReadings ? onHistoryPress : onConnectOrLogPress}
            accessibilityRole="button"
            accessibilityLabel="Heart Rate telemetry"
            style={({ pressed }) => [
              styles.tile,
              elevation.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xl,
                padding: spacing.base,
                gap: spacing.sm,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.tileHeader}>
              <View
                style={[
                  styles.iconSquare,
                  {
                    backgroundColor: hasHr ? colors.roseSoftBg : colors.skySoftBg,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <AppIcon
                  name="heart"
                  size={17}
                  color={hasHr ? colors.roseAccent : colors.primary}
                  fill={hasHr ? colors.roseAccent : 'none'}
                />
              </View>
              <View
                style={[
                  styles.chipPill,
                  {
                    backgroundColor: colors.slatePillBg,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <Text style={[typography.labelSm, { color: colors.slatePillText }]}>Resting</Text>
              </View>
            </View>

            <Text style={[typography.bodySmMedium, { color: colors.bodyText }]}>Heart Rate</Text>

            <View style={[styles.metricBaseline, { gap: spacing.xs }]}>
              <Text style={[typography.numericMetric, { color: colors.navyText }]}>
                {hasHr ? String(vitals.heartRateBpm) : '--'}
              </Text>
              <Text style={[typography.bodySmMedium, { color: colors.bodyText }]}>bpm</Text>
            </View>

            <View style={styles.tileFooter}>
              {hasHr ? (
                <>
                  <View style={[styles.deltaRow, { gap: spacing.xxs }]}>
                    <AppIcon name="trendingUp" size={12} color={colors.roseAccent} />
                    <Text style={[typography.labelSm, { color: colors.roseAccent }]}>
                      {vitals.heartRateDeltaBpm != null
                        ? `${vitals.heartRateDeltaBpm >= 0 ? '+' : ''}${vitals.heartRateDeltaBpm} bpm`
                        : 'Resting'}
                    </Text>
                  </View>
                  <MiniLineSparkline
                    series={vitals.heartRateSeries}
                    strokeColor={colors.roseAccent}
                  />
                </>
              ) : (
                <>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                    No data recorded
                  </Text>
                  <Text style={[typography.bodySm, { color: colors.subtleText }]}>—</Text>
                </>
              )}
            </View>
          </Pressable>

          {/* 2. Blood Pressure */}
          <Pressable
            onPress={vitals.hasAnyReadings ? onHistoryPress : onConnectOrLogPress}
            accessibilityRole="button"
            accessibilityLabel="Blood Pressure telemetry"
            style={({ pressed }) => [
              styles.tile,
              elevation.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xl,
                padding: spacing.base,
                gap: spacing.sm,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.tileHeader}>
              <View
                style={[
                  styles.iconSquare,
                  {
                    backgroundColor: colors.skySoftBg,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <AppIcon name="gauge" size={17} color={colors.primary} />
              </View>
              <View
                style={[
                  styles.chipPill,
                  {
                    backgroundColor: hasBp ? colors.emeraldSoftBg : colors.slatePillBg,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.labelSm,
                    { color: hasBp ? colors.emeraldText : colors.slatePillText },
                  ]}
                >
                  {hasBp ? (vitals.bloodPressureStatus ?? 'Optimal') : 'Clinical'}
                </Text>
              </View>
            </View>

            <Text style={[typography.bodySmMedium, { color: colors.bodyText }]}>
              Blood Pressure
            </Text>

            <View style={[styles.metricBaseline, { gap: spacing.xs }]}>
              <Text style={[typography.numericMetricCompact, { color: colors.navyText }]}>
                {hasBp ? `${vitals.systolicBp}/${vitals.diastolicBp}` : '--/--'}
              </Text>
              <Text style={[typography.bodySmMedium, { color: colors.bodyText }]}>mmHg</Text>
            </View>

            <View style={styles.tileFooter}>
              {hasBp ? (
                <>
                  <View style={[styles.deltaRow, { gap: spacing.xxs }]}>
                    <AppIcon name="checkCircle" size={13} color={colors.emeraldText} />
                    <Text style={[typography.labelSm, { color: colors.emeraldText }]}>Stable</Text>
                  </View>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>Sys/Dia</Text>
                </>
              ) : (
                <>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>Sys / Dia</Text>
                  <Text style={[typography.bodySm, { color: colors.subtleText }]}>—</Text>
                </>
              )}
            </View>
          </Pressable>
        </View>

        <View style={[styles.bentoRow, { gap: spacing.md }]}>
          {/* 3. Blood Glucose */}
          <Pressable
            onPress={vitals.hasAnyReadings ? onHistoryPress : onConnectOrLogPress}
            accessibilityRole="button"
            accessibilityLabel="Blood Glucose telemetry"
            style={({ pressed }) => [
              styles.tile,
              elevation.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xl,
                padding: spacing.base,
                gap: spacing.sm,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.tileHeader}>
              <View
                style={[
                  styles.iconSquare,
                  {
                    backgroundColor: colors.mintSoftBg,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <AppIcon name="droplet" size={17} color={colors.primary} />
              </View>
              <View
                style={[
                  styles.chipPill,
                  {
                    backgroundColor: colors.slatePillBg,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <Text style={[typography.labelSm, { color: colors.slatePillText }]}>Fasting</Text>
              </View>
            </View>

            <Text style={[typography.bodySmMedium, { color: colors.bodyText }]}>Blood Glucose</Text>

            <View style={[styles.metricBaseline, { gap: spacing.xs }]}>
              <Text style={[typography.numericMetric, { color: colors.navyText }]}>
                {hasGlucose ? String(vitals.fastingBloodGlucoseMgDl) : '--'}
              </Text>
              <Text style={[typography.bodySmMedium, { color: colors.bodyText }]}>mg/dL</Text>
            </View>

            <View style={styles.tileFooter}>
              {hasGlucose ? (
                <>
                  <Text style={[typography.bodySm, { color: colors.bodyText }]}>
                    {vitals.bloodGlucoseStatus ?? 'Normal 70–99'}
                  </Text>
                  <MiniLineSparkline
                    series={vitals.bloodGlucoseSeries}
                    strokeColor={colors.primary}
                  />
                </>
              ) : (
                <>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                    Target 70–99
                  </Text>
                  <Text style={[typography.bodySm, { color: colors.subtleText }]}>—</Text>
                </>
              )}
            </View>
          </Pressable>

          {/* 4. Sleep Total */}
          <Pressable
            onPress={vitals.hasAnyReadings ? onHistoryPress : onConnectOrLogPress}
            accessibilityRole="button"
            accessibilityLabel="Sleep Total telemetry"
            style={({ pressed }) => [
              styles.tile,
              elevation.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xl,
                padding: spacing.base,
                gap: spacing.sm,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.tileHeader}>
              <View
                style={[
                  styles.iconSquare,
                  {
                    backgroundColor: colors.lavenderSoftBg,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <AppIcon name="moon" size={17} color={colors.lavenderIcon} />
              </View>
              <View
                style={[
                  styles.chipPill,
                  {
                    backgroundColor: hasSleep ? colors.emeraldSoftBg : colors.slatePillBg,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.labelSm,
                    { color: hasSleep ? colors.emeraldText : colors.slatePillText },
                  ]}
                >
                  {hasSleep && vitals.sleepDeltaPercent != null
                    ? `${vitals.sleepDeltaPercent >= 0 ? '+' : ''}${vitals.sleepDeltaPercent}%`
                    : 'Duration'}
                </Text>
              </View>
            </View>

            <Text style={[typography.bodySmMedium, { color: colors.bodyText }]}>Sleep Total</Text>

            <View style={[styles.metricBaseline, { gap: spacing.xxs }]}>
              {hasSleep && sleepParts ? (
                <>
                  <Text style={[typography.numericMetric, { color: colors.navyText }]}>
                    {sleepParts.hours}
                  </Text>
                  <Text style={[typography.labelLg, { color: colors.bodyText }]}>h </Text>
                  <Text style={[typography.numericMetric, { color: colors.navyText }]}>
                    {sleepParts.mins}
                  </Text>
                  <Text style={[typography.labelLg, { color: colors.bodyText }]}>m</Text>
                </>
              ) : (
                <>
                  <Text style={[typography.numericMetricCompact, { color: colors.navyText }]}>
                    --
                  </Text>
                  <Text style={[typography.labelMd, { color: colors.bodyText }]}>h </Text>
                  <Text style={[typography.numericMetricCompact, { color: colors.navyText }]}>
                    --
                  </Text>
                  <Text style={[typography.labelMd, { color: colors.bodyText }]}>m</Text>
                </>
              )}
            </View>

            <View style={styles.tileFooter}>
              {hasSleep ? (
                <>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                    {formatDeepSleepLabel(vitals.deepSleepMinutes)}
                  </Text>
                  <MiniSleepBars
                    series={vitals.sleepSeries}
                    mutedColor={colors.sleepBarMuted}
                    activeColor={colors.sleepBarActive}
                  />
                </>
              ) : (
                <>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                    Synced trackers
                  </Text>
                  <Text style={[typography.bodySm, { color: colors.subtleText }]}>—</Text>
                </>
              )}
            </View>
          </Pressable>
        </View>
      </View>

      {!vitals.hasAnyReadings ? (
        <View
          style={[
            styles.syncBanner,
            {
              backgroundColor: colors.surfaceLow,
              borderColor: colors.borderSubtle,
              borderRadius: radii.lg,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              gap: spacing.md,
            },
          ]}
        >
          <View
            style={[
              styles.syncCircle,
              {
                backgroundColor: colors.mintBadgeBg,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="arrowLeftRight" size={17} color={colors.primary} />
          </View>

          <View style={styles.syncCopy}>
            <Text numberOfLines={1} style={[typography.labelMd, { color: colors.navyText }]}>
              Sync Apple Health or Log Manually
            </Text>
            <Text numberOfLines={1} style={[typography.bodySm, { color: colors.mutedText }]}>
              Auto-populate your daily vital statistics
            </Text>
          </View>

          <Pressable
            onPress={onConnectOrLogPress}
            accessibilityRole="button"
            accessibilityLabel="Connect or log vitals manually"
            style={({ pressed }) => [
              styles.connectBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: radii.full,
                paddingHorizontal: spacing.base,
                paddingVertical: spacing.sm,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text style={[typography.labelSm, { color: colors.onPrimary }]}>Connect</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    width: '100%',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bentoGrid: {
    width: '100%',
  },
  bentoRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconSquare: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBaseline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  syncCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncCopy: {
    flex: 1,
    minWidth: 0,
  },
  connectBtn: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const RecentVitalsGrid = memo(RecentVitalsGridComponent);
export default RecentVitalsGrid;
