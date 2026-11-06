import React, { memo } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { format, isToday, parseISO } from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { AppointmentItem } from '../../services/appointments/types';
import { extractInitials } from '../../services/home/homeDashboardService';

export interface UpcomingAppointmentCardProps {
  appointment: AppointmentItem;
  onPressCard: () => void;
  onCheckInPassPress: () => void;
  onGetDirectionsPress: () => void;
  onPrepGuidePress: () => void;
  onReschedulePress: () => void;
}

function UpcomingAppointmentCardComponent({
  appointment,
  onPressCard,
  onCheckInPassPress,
  onGetDirectionsPress,
  onPrepGuidePress,
  onReschedulePress,
}: UpcomingAppointmentCardProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  const scheduledDate = (() => {
    try {
      return parseISO(appointment.scheduledAt);
    } catch {
      return new Date();
    }
  })();

  const isTodayAppt = isToday(scheduledDate);
  const dateFormatted = (() => {
    try {
      if (isTodayAppt) {
        return `Today, ${format(scheduledDate, 'h:mm a')}`;
      }
      return format(scheduledDate, 'EEEE, MMM d • h:mm a');
    } catch {
      return appointment.scheduledAt;
    }
  })();

  const providerName = appointment.provider.name;
  const initials = extractInitials(providerName);
  const serviceTitle = appointment.serviceType || 'Consultation';
  const clinicName = appointment.clinic.name || 'Clinic';
  const isConfirmed = appointment.status === 'confirmed';

  return (
    <Pressable
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`Upcoming appointment with ${providerName}`}
      onPress={onPressCard}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.xl,
          padding: spacing.base,
          opacity: pressed ? 0.95 : 1,
        },
        elevation.card,
      ]}
    >
      {/* Top Header: Avatar + Info + Confirmed Badge */}
      <View style={styles.headerRow}>
        <View style={styles.avatarContainer}>
          {appointment.provider.avatarUrl ? (
            <Image
              source={{ uri: appointment.provider.avatarUrl }}
              style={[styles.avatar, { borderRadius: radii.md }]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  borderRadius: radii.md,
                  backgroundColor: colors.mintSoftBg,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelSm,
                  {
                    color: colors.primaryDeep,
                    fontWeight: '700',
                  },
                ]}
              >
                {initials}
              </Text>
            </View>
          )}
          {/* Status Indicator Dot on Avatar */}
          <View
            style={[
              styles.avatarStatusDot,
              {
                backgroundColor: isTodayAppt ? colors.amberText : colors.emeraldDot,
                borderColor: colors.surface,
                borderRadius: radii.full,
              },
            ]}
          />
        </View>

        <View style={styles.providerInfoColumn}>
          <View style={styles.nameBadgeRow}>
            <Text
              numberOfLines={1}
              style={[
                typography.cardTitle,
                {
                  color: colors.navyText,
                  fontWeight: '700',
                  flex: 1,
                },
              ]}
            >
              {providerName}
            </Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isConfirmed ? colors.emeraldSoftBg : colors.amberSoftBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <View
                style={[
                  styles.statusPillDot,
                  {
                    backgroundColor: isConfirmed ? colors.emeraldDot : colors.amberText,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <Text
                style={[
                  typography.labelSm,
                  {
                    color: isConfirmed ? colors.emeraldText : colors.amberText,
                    fontWeight: '700',
                  },
                ]}
              >
                {isConfirmed ? 'Confirmed' : 'Pending'}
              </Text>
            </View>
          </View>

          <Text
            numberOfLines={1}
            style={[
              typography.bodySm,
              {
                color: colors.mutedText,
                marginTop: 2,
              },
            ]}
          >
            {serviceTitle}
          </Text>

          <View style={styles.clinicRow}>
            <AppIcon name="building" size={13} color={colors.primaryDeep} />
            <Text
              numberOfLines={1}
              style={[
                typography.bodySmMedium,
                {
                  color: colors.primaryDeep,
                  marginLeft: 4,
                  fontWeight: '600',
                },
              ]}
            >
              {clinicName}
            </Text>
          </View>
        </View>
      </View>

      {/* Schedule Info Box */}
      <View
        style={[
          styles.scheduleBox,
          {
            backgroundColor: colors.mintSoftBg,
            borderRadius: radii.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            marginTop: spacing.md,
          },
        ]}
      >
        <View style={styles.timeRow}>
          <AppIcon
            name={isTodayAppt ? 'calendar' : 'clock'}
            size={16}
            color={colors.primaryDeep}
          />
          <Text
            style={[
              typography.labelMd,
              {
                color: colors.navyText,
                marginLeft: 6,
                fontWeight: '700',
              },
            ]}
          >
            {dateFormatted}
          </Text>
        </View>

        {isTodayAppt ? (
          <Text
            style={[
              typography.bodySm,
              {
                color: colors.mutedText,
              },
            ]}
          >
            Room 304 • Floor 3
          </Text>
        ) : null}
      </View>

      {/* Action Buttons Row */}
      <View style={[styles.actionsRow, { marginTop: spacing.md, gap: spacing.sm }]}>
        {isTodayAppt ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View Check-in Pass"
              onPress={onCheckInPassPress}
              style={({ pressed }) => [
                styles.primaryActionBtn,
                {
                  backgroundColor: colors.primaryDeep,
                  borderRadius: radii.full,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="badge" size={16} color={colors.onPrimary} />
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: colors.onPrimary,
                    fontWeight: '700',
                  },
                ]}
              >
                Check-in Pass
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get Directions"
              onPress={onGetDirectionsPress}
              style={({ pressed }) => [
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="navigation" size={15} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: colors.primaryDeep,
                    fontWeight: '700',
                  },
                ]}
              >
                Get Directions
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View Prep Guide"
              onPress={onPrepGuidePress}
              style={({ pressed }) => [
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="clipboard" size={15} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: colors.primaryDeep,
                    fontWeight: '700',
                  },
                ]}
              >
                Prep Guide
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reschedule Appointment"
              onPress={onReschedulePress}
              style={({ pressed }) => [
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="calendar" size={15} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: colors.primaryDeep,
                    fontWeight: '700',
                  },
                ]}
              >
                Reschedule
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </Pressable>
  );
}

export const UpcomingAppointmentCard = memo(UpcomingAppointmentCardComponent);
export default UpcomingAppointmentCard;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStatusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderWidth: 2,
  },
  providerInfoColumn: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  statusPillDot: {
    width: 6,
    height: 6,
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  scheduleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    gap: 6,
  },
});
