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
  onPrepGuidePress?: () => void;
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
  const isPending = appointment.status === 'pending';
  const isActionRequired = appointment.status === 'action_required';
  const showStatusPill = isTodayAppt || isConfirmed || isPending || isActionRequired;
  const statusPillBg = isActionRequired
    ? colors.roseSoftBg
    : isPending
      ? colors.amberSoftBg
      : colors.emeraldSoftBg;
  const statusDotColor = isActionRequired
    ? colors.roseAccent
    : isPending
      ? colors.amberText
      : colors.emeraldDot;
  const statusTextColor = isActionRequired
    ? colors.roseAccent
    : isPending
      ? colors.amberText
      : colors.emeraldText;
  const statusLabel = isActionRequired
    ? 'Action Required'
    : isPending
      ? 'Pending'
      : 'Confirmed';

  return (
    <Pressable
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`Upcoming appointment with ${providerName}`}
      onPress={onPressCard}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
          borderRadius: radii.xl,
          padding: spacing.base,
          opacity: pressed ? 0.96 : 1,
        },
        elevation.card,
      ]}
    >
      {/* Top Header: Avatar + Info + Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.avatarContainer}>
          {appointment.provider.avatarUrl ? (
            <Image
              source={{ uri: appointment.provider.avatarUrl }}
              style={[styles.avatar, { borderRadius: radii.lg }]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  borderRadius: radii.lg,
                  backgroundColor: colors.mintSoftBg,
                },
              ]}
            >
              <Text
                style={[
                  typography.cardTitle,
                  {
                    color: colors.primary,
                    fontWeight: '700',
                  },
                ]}
              >
                {initials}
              </Text>
            </View>
          )}
          {/* Bottom-right hollow amber ring indicator */}
          <View
            style={[
              styles.avatarStatusOuter,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.full,
              },
            ]}
          >
            <View
              style={[
                styles.avatarStatusInner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.amberText,
                  borderRadius: radii.full,
                },
              ]}
            />
          </View>
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
            {showStatusPill ? (
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: statusPillBg,
                    borderColor: isConfirmed ? colors.mintBadgeBorder : 'transparent',
                    borderWidth: isConfirmed ? 1 : 0,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusPillDot,
                    {
                      backgroundColor: statusDotColor,
                      borderRadius: radii.full,
                    },
                  ]}
                />
                <Text
                  style={[
                    typography.labelSm,
                    {
                      color: statusTextColor,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            ) : null}
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
            <AppIcon
              name={isTodayAppt ? 'building' : 'location'}
              size={13}
              color={colors.primary}
            />
            <Text
              numberOfLines={1}
              style={[
                typography.bodySm,
                {
                  color: colors.mutedText,
                  marginLeft: 5,
                  flex: 1,
                },
              ]}
            >
              {clinicName}
            </Text>
          </View>
        </View>
      </View>

      {/* Schedule Info Tray */}
      <View
        style={[
          styles.scheduleBox,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.md,
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
            color={colors.primary}
          />
          <Text
            numberOfLines={1}
            style={[
              typography.labelBold,
              {
                color: colors.navyText,
                marginLeft: spacing.sm,
              },
            ]}
          >
            {dateFormatted}
          </Text>
        </View>

        {appointment.subject ? (
          <Text
            numberOfLines={1}
            style={[
              typography.bodySm,
              {
                color: colors.mutedText,
                flexShrink: 1,
                marginLeft: spacing.sm,
              },
            ]}
          >
            {appointment.subject}
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
              onPress={(e) => {
                e?.stopPropagation?.();
                onCheckInPassPress();
              }}
              style={({ pressed }) => [
                styles.primaryActionBtn,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radii.full,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="idCard" size={16} color={colors.onPrimary} />
              <Text
                numberOfLines={1}
                style={[
                  typography.labelBold,
                  {
                    color: colors.onPrimary,
                  },
                ]}
              >
                Check-in Pass
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get Directions"
              onPress={(e) => {
                e?.stopPropagation?.();
                onGetDirectionsPress();
              }}
              style={({ pressed }) => [
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.surfaceLow,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="navigation" size={15} color={colors.primary} />
              <Text
                numberOfLines={1}
                style={[
                  typography.labelBold,
                  {
                    color: colors.navyText,
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
              onPress={(e) => {
                e?.stopPropagation?.();
                onPrepGuidePress?.();
              }}
              style={({ pressed }) => [
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.skySoftBg,
                  borderRadius: radii.full,
                  borderColor: colors.surfaceContainer,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="clipboard" size={15} color={colors.primary} />
              <Text
                numberOfLines={1}
                style={[
                  typography.labelBold,
                  {
                    color: colors.navyText,
                  },
                ]}
              >
                Prep Guide
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reschedule Appointment"
              onPress={(e) => {
                e?.stopPropagation?.();
                onReschedulePress();
              }}
              style={({ pressed }) => [
                styles.secondaryActionBtn,
                {
                  backgroundColor: colors.surfaceLow,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="clipboardPen" size={15} color={colors.bodyText} />
              <Text
                numberOfLines={1}
                style={[
                  typography.labelBold,
                  {
                    color: colors.navyText,
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
    width: 52,
    height: 52,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStatusOuter: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStatusInner: {
    width: 10,
    height: 10,
    borderWidth: 2,
  },
  providerInfoColumn: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
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
    flexShrink: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryActionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  secondaryActionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 6,
  },
});
