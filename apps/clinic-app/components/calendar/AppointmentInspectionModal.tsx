import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import { notify } from '../../utils/feedback';
import { clinicService } from '../../services/clinicService';
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
  onReminderSent?: (appointment: ExtendedAppointmentItem) => void;
}

function formatDateTimeDisplay(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return `${date} at ${time}`;
  } catch {
    return dateStr;
  }
}

export function AppointmentInspectionModal({
  visible,
  appointment,
  onClose,
  onCheckIn,
  onReschedule,
  onCancel,
  onReminderSent,
}: AppointmentInspectionModalProps) {
  const [currentAppointment, setCurrentAppointment] = useState<ExtendedAppointmentItem | null>(appointment);
  const [sendingReminder, setSendingReminder] = useState<boolean>(false);

  useEffect(() => {
    setCurrentAppointment(appointment);
  }, [appointment]);

  if (!visible || !currentAppointment) {
    return null;
  }

  const isReminderDisabled =
    currentAppointment.status === 'Cancelled' ||
    currentAppointment.status === 'Completed' ||
    sendingReminder;

  const handleSendReminder = async () => {
    if (isReminderDisabled) return;
    setSendingReminder(true);
    try {
      const [updated, err] = await clinicService.sendAppointmentReminder(currentAppointment.id);
      if (err || !updated) {
        notify.error(err?.message || 'Failed to dispatch appointment push reminder.');
        return;
      }
      const merged: ExtendedAppointmentItem = {
        ...currentAppointment,
        ...updated,
      };
      setCurrentAppointment(merged);
      onReminderSent?.(merged);
      notify.success('Appointment push reminder sent to patient.');
    } catch {
      notify.error('Failed to dispatch appointment push reminder.');
    } finally {
      setSendingReminder(false);
    }
  };

  const urgency = resolveAppointmentUrgency(currentAppointment);
  const urgencyTokens = resolveUrgencyTokens(urgency);
  const statusTokens = resolveStatusTokens(currentAppointment.status);

  const timeStr = currentAppointment.scheduledAt.includes('T')
    ? currentAppointment.scheduledAt.split('T')[1].slice(0, 5)
    : '';
  const dateStr = currentAppointment.scheduledAt.split('T')[0];
  const formattedTime = timeStr ? formatTime12(timeStr) : '';

  const canCheckIn =
    (currentAppointment.status === 'Confirmed' || currentAppointment.status === 'Pending') &&
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
          aria-label={`Appointment details for ${currentAppointment.patientName}`}
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
                {currentAppointment.patientName}
              </ThemedText>
              <ThemedText
                data-testid="drawer-patient-id"
                variant="small"
                color={theme.colors.textMuted}
              >
                {currentAppointment.patientId}
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
                  {currentAppointment.doctorName || 'Unassigned'}
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
                  {currentAppointment.scheduledAt}
                  {formattedTime ? ` (${dateStr} at ${formattedTime})` : ''}
                </ThemedText>
              </View>

              {currentAppointment.roomName ? (
                <View style={styles.infoRow}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                    Assigned Room
                  </ThemedText>
                  <ThemedText
                    data-testid="drawer-room-name"
                    variant="body"
                    color={theme.colors.text}
                  >
                    {currentAppointment.roomName}
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                  Service Type
                </ThemedText>
                <ThemedText variant="body" color={theme.colors.text}>
                  {currentAppointment.serviceType || 'General Consultation'}
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
                  {currentAppointment.reason || 'General Consultation'}
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
                  {currentAppointment.notes || 'None'}
                </ThemedText>
              </View>
            </View>

            {/* Push Notification & Reminder Status Section */}
            <View
              data-testid="reminder-status-section"
              testID="reminder-status-section"
              style={styles.reminderSection}
            >
              <View style={styles.reminderHeader}>
                <Icon name="bell" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Push Notification & Reminder Status
                </ThemedText>
              </View>

              <View style={styles.reminderContent}>
                <View style={styles.infoRow}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                    24-Hour Advance Reminder
                  </ThemedText>
                  <View style={styles.statusRow}>
                    <Icon
                      name={currentAppointment.reminder24hSent ? 'check' : 'clock'}
                      size={14}
                      color={currentAppointment.reminder24hSent ? theme.colors.success : theme.colors.textSecondary}
                    />
                    <ThemedText
                      data-testid="status-reminder-24h"
                      variant="body"
                      color={currentAppointment.reminder24hSent ? theme.colors.successText : theme.colors.text}
                    >
                      {currentAppointment.reminder24hSent
                        ? `Sent at ${formatDateTimeDisplay(currentAppointment.reminder24hSentAt)}`
                        : 'Scheduled (24h advance)'}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                    2-Hour Advance Reminder
                  </ThemedText>
                  <View style={styles.statusRow}>
                    <Icon
                      name={currentAppointment.reminder2hSent ? 'check' : 'clock'}
                      size={14}
                      color={currentAppointment.reminder2hSent ? theme.colors.success : theme.colors.textSecondary}
                    />
                    <ThemedText
                      data-testid="status-reminder-2h"
                      variant="body"
                      color={currentAppointment.reminder2hSent ? theme.colors.successText : theme.colors.text}
                    >
                      {currentAppointment.reminder2hSent
                        ? `Sent at ${formatDateTimeDisplay(currentAppointment.reminder2hSentAt)}`
                        : 'Scheduled (2h advance)'}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.label}>
                    Last Dispatched Reminder
                  </ThemedText>
                  <ThemedText
                    data-testid="status-last-reminder"
                    variant="body"
                    color={currentAppointment.lastReminderSentAt ? theme.colors.text : theme.colors.textMuted}
                  >
                    {currentAppointment.lastReminderSentAt
                      ? `${formatDateTimeDisplay(currentAppointment.lastReminderSentAt)} (${currentAppointment.lastReminderType || 'manual'})`
                      : 'None sent yet'}
                  </ThemedText>
                </View>

                {/* Send Push Reminder CTA */}
                <Pressable
                  data-testid="btn-send-push-reminder"
                  testID="btn-send-push-reminder"
                  accessibilityRole="button"
                  accessibilityLabel="Send push reminder to patient"
                  disabled={isReminderDisabled}
                  onPress={handleSendReminder}
                  style={({ pressed }) => [
                    styles.btnSendReminder,
                    isReminderDisabled && styles.btnSendReminderDisabled,
                    pressed && !isReminderDisabled && styles.pressed,
                  ]}
                >
                  <Icon
                    name={sendingReminder ? 'clock' : 'bell'}
                    size={theme.sizes.iconSm}
                    color={isReminderDisabled ? theme.colors.textMuted : theme.colors.onPrimary}
                  />
                  <ThemedText
                    variant="smallBold"
                    color={isReminderDisabled ? theme.colors.textMuted : theme.colors.onPrimary}
                  >
                    {sendingReminder ? 'Sending Reminder...' : 'Send Push Reminder'}
                  </ThemedText>
                </Pressable>
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
                onPress={() => onCheckIn(currentAppointment)}
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

            {onReschedule && currentAppointment.status !== 'Cancelled' ? (
              <Pressable
                data-testid="btn-drawer-reschedule"
                testID="btn-drawer-reschedule"
                accessibilityRole="button"
                onPress={() => onReschedule(currentAppointment)}
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

            {onCancel && currentAppointment.status !== 'Cancelled' ? (
              <Pressable
                data-testid="btn-drawer-cancel"
                testID="btn-drawer-cancel"
                accessibilityRole="button"
                onPress={() => onCancel(currentAppointment)}
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
  reminderSection: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  reminderContent: {
    gap: theme.spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnSendReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    marginTop: theme.spacing.xs,
  },
  btnSendReminderDisabled: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
});

export default AppointmentInspectionModal;
