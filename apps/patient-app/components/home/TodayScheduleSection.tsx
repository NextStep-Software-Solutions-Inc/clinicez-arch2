import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type {
  TodayMedicationScheduleDto,
  TodayMedicationScheduleItemDto,
} from '../../services/api/homeApi';

export interface TodayScheduleSectionProps {
  schedule: TodayMedicationScheduleDto;
  loggingMedicationId?: string | null;
  onAddOrManagePress: () => void;
  onLogMedicationPress: (item: TodayMedicationScheduleItemDto) => void;
}

function formatTakenTime(takenAtIso: string | null, fallbackSlot: string): string {
  if (!takenAtIso) return fallbackSlot;
  try {
    return `Taken at ${format(parseISO(takenAtIso), 'h:mm a')}`;
  } catch {
    return 'Taken today';
  }
}

function TodayScheduleSectionComponent({
  schedule,
  loggingMedicationId,
  onAddOrManagePress,
  onLogMedicationPress,
}: TodayScheduleSectionProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const hasItems = schedule.items.length > 0;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.headerRow}>
        <View style={[styles.headerLeft, { gap: spacing.sm }]}>
          <Text style={[typography.headlineSm, { color: colors.navyText }]}>
            Today&apos;s Schedule
          </Text>
          <View
            style={[
              styles.countCircle,
              {
                backgroundColor: hasItems ? colors.mintAvatarBg : colors.slatePillBg,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm,
              },
            ]}
          >
            <Text
              style={[
                typography.labelSm,
                { color: hasItems ? colors.mintAvatarText : colors.slatePillText },
              ]}
            >
              {schedule.activeCount}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onAddOrManagePress}
          accessibilityRole="button"
          accessibilityLabel={hasItems ? 'Manage all medications' : 'Add medication'}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
        >
          <Text style={[typography.labelMd, { color: colors.primary }]}>
            {hasItems ? 'Manage All' : '+ Add Medication'}
          </Text>
        </Pressable>
      </View>

      {hasItems ? (
        <View style={{ gap: spacing.sm }}>
          {schedule.items.map((item) => {
            const isLogging = loggingMedicationId === item.medicationId;
            const statusText = item.isTakenToday
              ? formatTakenTime(item.takenAt, item.scheduledTimeLabel)
              : item.scheduledTimeLabel;
            const subtitleLine = [item.instructions, statusText].filter(Boolean).join(' • ');

            return (
              <View
                key={item.medicationId}
                style={[
                  styles.medCard,
                  elevation.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.borderSubtle,
                    borderRadius: radii.xl,
                    paddingHorizontal: spacing.base,
                    paddingVertical: spacing.md,
                    gap: spacing.md,
                  },
                ]}
              >
                <View
                  style={[
                    styles.medIconCircle,
                    {
                      borderRadius: radii.full,
                      backgroundColor: item.isTakenToday
                        ? colors.emeraldSoftBg
                        : colors.surfaceLow,
                    },
                  ]}
                >
                  <AppIcon
                    name={item.isTakenToday ? 'check' : 'clock'}
                    size={18}
                    color={item.isTakenToday ? colors.emeraldText : colors.primary}
                  />
                </View>

                <View style={styles.medCopy}>
                  <Text numberOfLines={1} style={[typography.labelLg, { color: colors.navyText }]}>
                    {item.medicationName}
                    {item.dosage ? (
                      <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                        {' '}
                        {item.dosage}
                      </Text>
                    ) : null}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[typography.bodySm, { color: colors.bodyText }]}
                  >
                    {subtitleLine}
                  </Text>
                </View>

                {item.isTakenToday ? (
                  <View
                    style={[
                      styles.takenPill,
                      {
                        backgroundColor: colors.emeraldSoftBg,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                      },
                    ]}
                  >
                    <Text style={[typography.labelSm, { color: colors.emeraldText }]}>Taken</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => onLogMedicationPress(item)}
                    disabled={isLogging}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${item.medicationName} dose now`}
                    style={({ pressed }) => [
                      styles.logNowBtn,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.base,
                        paddingVertical: spacing.sm,
                        opacity: isLogging ? 0.65 : pressed ? 0.86 : 1,
                      },
                    ]}
                  >
                    <Text style={[typography.labelSm, { color: colors.onPrimary }]}>
                      {isLogging ? 'Logging...' : 'Log Now'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View
          style={[
            styles.emptyCard,
            elevation.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              borderRadius: radii.xl,
              padding: spacing.base,
              gap: spacing.md,
            },
          ]}
        >
          <View
            style={[
              styles.medIconCircle,
              {
                backgroundColor: colors.lavenderSoftBg,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="pill" size={18} color={colors.lavenderIcon} />
          </View>

          <View style={styles.medCopy}>
            <Text numberOfLines={1} style={[typography.labelMd, { color: colors.navyText }]}>
              No active medications scheduled
            </Text>
            <Text style={[typography.bodySm, { color: colors.bodyText }]}>
              Have an existing prescription? Tap to add medication or sync with your clinic records.
            </Text>
          </View>

          <Pressable
            onPress={onAddOrManagePress}
            accessibilityRole="button"
            accessibilityLabel="Add medication to schedule"
            style={({ pressed }) => [
              styles.addPillBtn,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.full,
                paddingHorizontal: spacing.base,
                paddingVertical: spacing.sm,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[typography.labelSm, { color: colors.primary }]}>+ Add</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countCircle: {
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 72,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  medIconCircle: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  takenPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logNowBtn: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPillBtn: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const TodayScheduleSection = memo(TodayScheduleSectionComponent);
export default TodayScheduleSection;
