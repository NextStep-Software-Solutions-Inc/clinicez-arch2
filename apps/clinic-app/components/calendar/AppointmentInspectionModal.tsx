import React from 'react';
import { View, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import type { ExtendedAppointmentItem } from './types';
import {
  resolveAppointmentUrgency,
  resolveUrgencyTokens,
  resolveStatusTokens,
  formatTime12,
} from './calendarUtils';

export interface AppointmentInspectionModalProps {
  visible: boolean;
  appointment: ExtendedAppointmentItem | null;
  onClose: () => void;
  onCheckIn?: (appointment: ExtendedAppointmentItem) => void;
  onReschedule?: (appointment: ExtendedAppointmentItem) => void;
  onCancel?: (appointment: ExtendedAppointmentItem) => void;
}

export function AppointmentInspectionModal({
  visible,
  appointment,
  onClose,
  onCheckIn,
  onReschedule,
  onCancel,
}: AppointmentInspectionModalProps) {
  if (!visible || !appointment) {
    return null;
  }

  const urgency = resolveAppointmentUrgency(appointment);
  const urgencyTokens = resolveUrgencyTokens(urgency);
  const statusTokens = resolveStatusTokens(appointment.status);

  const timeStr = appointment.scheduledAt.includes('T')
    ? appointment.scheduledAt.split('T')[1].slice(0, 5)
    : '';
  const dateStr = appointment.scheduledAt.split('T')[0];
  const formattedTime = timeStr ? formatTime12(timeStr) : '';

  const canCheckIn =
    (appointment.status === 'Confirmed' || appointment.status === 'Pending') &&
    !!onCheckIn;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          data-testid="appointment-inspection-drawer"
          testID="appointment-inspection-drawer"
          data-visible="true"
          role="dialog"
          aria-modal={true}
          aria-label={`Appointment details for ${appointment.patientName}`}
          style={styles.drawerCard}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleArea}>
              <ThemedText
                data-testid="drawer-patient-name"
                variant="h3"
                color={theme.colors.text}
              >
                {appointment.patientName}
              </ThemedText>
              <ThemedText
                data-testid="drawer-patient-id"
                variant="small"
                color={theme.colors.textMuted}
              >
                {appointment.patientId}
              </ThemedText>
            </View>

            <Pressable
              data-testid="btn-drawer-close"
              testID="btn-drawer-close"
              accessibilityRole="button"
              accessibilityLabel="Close details"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeIconBtn,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="close"
                size={theme.sizes.iconMd}
                color={theme.colors.textMuted}
              />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Badges Row */}
            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: urgencyTokens.badgeBg },
                ]}
              >
                <ThemedText
                  variant="caption"
                  color={urgencyTokens.badgeText}
                  style={{ fontWeight: '700' }}
                >
                  {urgencyTokens.label}
                </ThemedText>
              </View>

              <View
                style={[
                  styles.badge,
                  { backgroundColor: statusTokens.badgeBg },
                ]}
              >
                <ThemedText
                  variant="caption"
                  color={statusTokens.badgeText}
                  style={{ fontWeight: '600' }}
                >
                  {statusTokens.label}
                </ThemedText>
              </View>
            </View>

            {/* Grid of detail rows */}
            <View style={styles.section}>
              <View style={styles.infoRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                  Attending Physician
                </ThemedText>
                <ThemedText
                  data-testid="drawer-doctor-name"
                  variant="body"
                  color={theme.colors.text}
                >
                  {appointment.doctorName || 'Unassigned'}
                </ThemedText>
              </View>

              <View style={styles.infoRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                  Scheduled At
                </ThemedText>
                <ThemedText
                  data-testid="drawer-scheduled-at"
                  variant="body"
                  color={theme.colors.text}
                >
                  {appointment.scheduledAt}
                  {formattedTime ? ` (${dateStr} at ${formattedTime})` : ''}
                </ThemedText>
              </View>

              {appointment.roomName ? (
                <View style={styles.infoRow}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                    Assigned Room
                  </ThemedText>
                  <ThemedText
                    data-testid="drawer-room-name"
                    variant="body"
                    color={theme.colors.text}
                  >
                    {appointment.roomName}
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                  Service Type
                </ThemedText>
                <ThemedText variant="body" color={theme.colors.text}>
                  {appointment.serviceType || 'General Consultation'}
                </ThemedText>
              </View>

              <View style={styles.infoRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                  Reason for Visit
                </ThemedText>
                <ThemedText
                  data-testid="drawer-reason"
                  variant="body"
                  color={theme.colors.text}
                >
                  {appointment.reason || 'General Consultation'}
                </ThemedText>
              </View>

              <View style={styles.infoRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                  Notes
                </ThemedText>
                <ThemedText
                  data-testid="drawer-notes"
                  variant="body"
                  color={theme.colors.textSecondary}
                >
                  {appointment.notes || 'None'}
                </ThemedText>
              </View>
            </View>
          </ScrollView>

          {/* Footer CTAs */}
          <View
            data-testid="drawer-actions"
            testID="drawer-actions"
            style={styles.footer}
          >
            {canCheckIn ? (
              <Pressable
                data-testid="btn-drawer-checkin"
                testID="btn-drawer-checkin"
                accessibilityRole="button"
                onPress={() => onCheckIn(appointment)}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name="check"
                  size={theme.sizes.iconSm}
                  color={theme.colors.onPrimary}
                />
                <ThemedText variant="smallBold" color={theme.colors.onPrimary}>
                  Check In
                </ThemedText>
              </Pressable>
            ) : null}

            {onReschedule && appointment.status !== 'Cancelled' ? (
              <Pressable
                data-testid="btn-drawer-reschedule"
                testID="btn-drawer-reschedule"
                accessibilityRole="button"
                onPress={() => onReschedule(appointment)}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnSecondary,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name="calendar"
                  size={theme.sizes.iconSm}
                  color={theme.colors.text}
                />
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Reschedule
                </ThemedText>
              </Pressable>
            ) : null}

            {onCancel && appointment.status !== 'Cancelled' ? (
              <Pressable
                data-testid="btn-drawer-cancel"
                testID="btn-drawer-cancel"
                accessibilityRole="button"
                onPress={() => onCancel(appointment)}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnDanger,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText variant="smallBold" color={theme.colors.emergencyText}>
                  Cancel
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  drawerCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: theme.spacing.lg,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  headerTitleArea: {
    flex: 1,
  },
  closeIconBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
  },
  section: {
    gap: theme.spacing.md,
  },
  infoRow: {
    gap: 2,
  },
  label: {
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    flexWrap: 'wrap',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
  },
  btnSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  btnDanger: {
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  pressed: {
    opacity: 0.75,
  },
});

export default AppointmentInspectionModal;
