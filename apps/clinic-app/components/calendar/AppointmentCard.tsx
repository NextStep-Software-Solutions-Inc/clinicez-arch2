import React from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import type { ExtendedAppointmentItem } from './types';
import {
  resolveAppointmentUrgency,
  resolveUrgencyTokens,
  resolveStatusTokens,
  formatTime12,
  getAppointmentLocalDateTime,
} from './calendarUtils';

export interface AppointmentCardProps {
  appointment: ExtendedAppointmentItem;
  variant?: 'compact' | 'timeline' | 'standard';
  onSelect: (appointment: ExtendedAppointmentItem) => void;
  onCheckIn?: (appointment: ExtendedAppointmentItem) => void;
  onReschedule?: (appointment: ExtendedAppointmentItem) => void;
  onCancel?: (appointment: ExtendedAppointmentItem) => void;
  style?: ViewStyle;
}

export function AppointmentCard({
  appointment,
  variant = 'standard',
  onSelect,
  onCheckIn,
  onReschedule,
  onCancel,
  style,
}: AppointmentCardProps) {
  const urgency = resolveAppointmentUrgency(appointment);
  const urgencyTokens = resolveUrgencyTokens(urgency);
  const statusTokens = resolveStatusTokens(appointment.status);

  const { formattedTime } = getAppointmentLocalDateTime(appointment.scheduledAt);

  // Compact variant: for MonthView day cells
  if (variant === 'compact') {
    return (
      <Pressable
        data-testid={`appointment-card-${appointment.id}`}
        testID={`appointment-card-${appointment.id}`}
        data-appointment-id={appointment.id}
        data-urgency={urgency}
        data-status={appointment.status}
        accessibilityRole="button"
        accessibilityLabel={`${appointment.patientName}, ${formattedTime}, ${urgencyTokens.label}`}
        onPress={() => onSelect(appointment)}
        style={({ pressed }) => [
          styles.compactChip,
          {
            backgroundColor: urgencyTokens.badgeBg,
            borderColor: urgencyTokens.borderColor,
          },
          pressed && styles.pressed,
          style,
        ]}
      >
        <View style={styles.compactRow}>
          <ThemedText
            data-testid="card-patient-name"
            variant="caption"
            style={[
              styles.compactText,
              { color: urgencyTokens.badgeText, flex: 1 },
              statusTokens.isStrikethrough && styles.strikethrough,
            ]}
            numberOfLines={1}
          >
            {formattedTime ? `${formattedTime} ` : ''}
            {appointment.patientName}
          </ThemedText>
          {appointment.lastReminderSentAt ? (
            <View data-testid="card-reminder-badge" testID="card-reminder-badge">
              <Icon name="bell" size={10} color={urgencyTokens.badgeText} />
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // Timeline variant: for WeekView & DayView slotted blocks
  if (variant === 'timeline') {
    return (
      <Pressable
        data-testid={`appointment-card-${appointment.id}`}
        testID={`appointment-card-${appointment.id}`}
        data-appointment-id={appointment.id}
        data-urgency={urgency}
        data-status={appointment.status}
        accessibilityRole="button"
        accessibilityLabel={`${appointment.patientName}, ${appointment.serviceType || 'Consultation'}`}
        onPress={() => onSelect(appointment)}
        style={({ pressed }) => [
          styles.timelineCard,
          {
            borderColor: urgencyTokens.borderColor,
            backgroundColor: theme.colors.surface,
          },
          pressed && styles.pressed,
          style,
        ]}
      >
        <View style={styles.topRow}>
          <ThemedText
            data-testid="card-patient-name"
            variant="smallBold"
            style={[
              styles.patientName,
              statusTokens.isStrikethrough && styles.strikethrough,
            ]}
            numberOfLines={1}
          >
            {appointment.patientName}
          </ThemedText>
          <View
            data-testid="card-urgency-badge"
            style={[
              styles.badge,
              {
                backgroundColor: urgencyTokens.badgeBg,
              },
            ]}
          >
            <ThemedText
              variant="caption"
              style={{ color: urgencyTokens.badgeText, fontWeight: '700' }}
            >
              {urgencyTokens.label}
            </ThemedText>
          </View>
        </View>

        <View style={styles.badgeRow}>
          <View
            data-testid="card-status-badge"
            style={[
              styles.badge,
              {
                backgroundColor: statusTokens.badgeBg,
              },
            ]}
          >
            <ThemedText
              variant="caption"
              style={{ color: statusTokens.badgeText }}
            >
              {statusTokens.label}
            </ThemedText>
          </View>
          {appointment.lastReminderSentAt ? (
            <View
              data-testid="card-reminder-badge"
              testID="card-reminder-badge"
              style={styles.timelineReminderBadge}
            >
              <Icon name="bell" size={12} color={theme.colors.primaryDark} />
            </View>
          ) : null}
          {appointment.doctorName ? (
            <ThemedText
              data-testid="card-doctor-name"
              variant="caption"
              color={theme.colors.textSecondary}
              numberOfLines={1}
            >
              {appointment.doctorName}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // Standard variant: full card with quick actions for AgendaView
  return (
    <Pressable
      data-testid={`appointment-card-${appointment.id}`}
      testID={`appointment-card-${appointment.id}`}
      data-appointment-id={appointment.id}
      data-urgency={urgency}
      data-status={appointment.status}
      accessibilityRole="button"
      accessibilityLabel={`Appointment for ${appointment.patientName}`}
      onPress={() => onSelect(appointment)}
      style={({ pressed }) => [
        styles.standardCard,
        {
          borderColor: urgencyTokens.borderColor,
          backgroundColor: theme.colors.surface,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleInfo}>
          <ThemedText
            data-testid="card-patient-name"
            variant="bodyBold"
            style={[
              styles.patientName,
              statusTokens.isStrikethrough && styles.strikethrough,
            ]}
          >
            {appointment.patientName}
          </ThemedText>
          {formattedTime ? (
            <ThemedText variant="small" color={theme.colors.textMuted}>
              {formattedTime} ({appointment.durationMinutes || 30} mins)
            </ThemedText>
          ) : null}
        </View>

        <View
          data-testid="card-urgency-badge"
          style={[
            styles.badge,
            {
              backgroundColor: urgencyTokens.badgeBg,
            },
          ]}
        >
          <ThemedText
            variant="caption"
            style={{ color: urgencyTokens.badgeText, fontWeight: '700' }}
          >
            {urgencyTokens.label}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View
          data-testid="card-status-badge"
          style={[
            styles.badge,
            {
              backgroundColor: statusTokens.badgeBg,
            },
          ]}
        >
          <ThemedText
            variant="caption"
            style={{ color: statusTokens.badgeText }}
          >
            {statusTokens.label}
          </ThemedText>
        </View>

        {appointment.lastReminderSentAt ? (
          <View
            data-testid="card-reminder-badge"
            testID="card-reminder-badge"
            style={styles.reminderBadge}
          >
            <Icon name="bell" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
            <ThemedText
              variant="caption"
              color={theme.colors.primaryDark}
              style={{ fontWeight: '600' }}
            >
              Reminder Sent
            </ThemedText>
          </View>
        ) : null}

        {appointment.doctorName ? (
          <ThemedText
            data-testid="card-doctor-name"
            variant="small"
            color={theme.colors.textSecondary}
          >
            {appointment.doctorName}
          </ThemedText>
        ) : null}

        {appointment.roomName ? (
          <ThemedText variant="small" color={theme.colors.textMuted}>
            · {appointment.roomName}
          </ThemedText>
        ) : null}
      </View>

      {appointment.reason ? (
        <ThemedText
          variant="small"
          color={theme.colors.textSecondary}
          style={styles.reasonText}
          numberOfLines={2}
        >
          Reason: {appointment.reason}
        </ThemedText>
      ) : null}

      {/* Action buttons row */}
      <View style={styles.actionsRow}>
        {onCheckIn &&
        (appointment.status === 'Confirmed' || appointment.status === 'Pending') ? (
          <Pressable
            data-testid={`btn-checkin-${appointment.id}`}
            testID={`btn-checkin-${appointment.id}`}
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              onCheckIn(appointment);
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnPrimary,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="check"
              size={theme.sizes.iconSm}
              color={theme.colors.onPrimary}
            />
            <ThemedText
              variant="captionBold"
              color={theme.colors.onPrimary}
            >
              Check In
            </ThemedText>
          </Pressable>
        ) : null}

        {onReschedule && appointment.status !== 'Cancelled' ? (
          <Pressable
            data-testid={`btn-reschedule-${appointment.id}`}
            testID={`btn-reschedule-${appointment.id}`}
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              onReschedule(appointment);
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnSecondary,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="calendar"
              size={theme.sizes.iconSm}
              color={theme.colors.textSecondary}
            />
            <ThemedText
              variant="captionBold"
              color={theme.colors.textSecondary}
            >
              Reschedule
            </ThemedText>
          </Pressable>
        ) : null}

        {onCancel && appointment.status !== 'Cancelled' ? (
          <Pressable
            data-testid={`btn-cancel-${appointment.id}`}
            testID={`btn-cancel-${appointment.id}`}
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              onCancel(appointment);
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnGhost,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText
              variant="caption"
              color={theme.colors.emergencyText}
            >
              Cancel
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactChip: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    marginTop: 2,
  },
  compactText: {
    fontWeight: '600',
  },
  timelineCard: {
    borderLeftWidth: 3,
    borderTopWidth: theme.sizes.borderWidth,
    borderRightWidth: theme.sizes.borderWidth,
    borderBottomWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    ...theme.shadows.sm,
  },
  standardCard: {
    borderLeftWidth: 4,
    borderTopWidth: theme.sizes.borderWidth,
    borderRightWidth: theme.sizes.borderWidth,
    borderBottomWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  titleInfo: {
    flex: 1,
  },
  patientName: {
    color: theme.colors.text,
  },
  badge: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    alignSelf: 'flex-start',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  reasonText: {
    marginTop: theme.spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  actionBtnPrimary: {
    backgroundColor: theme.colors.primary,
  },
  actionBtnSecondary: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  actionBtnGhost: {
    paddingHorizontal: theme.spacing.xs,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  pressed: {
    opacity: 0.75,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
  },
  timelineReminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
  },
});

export default AppointmentCard;
