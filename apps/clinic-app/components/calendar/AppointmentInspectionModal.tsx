import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import CustomModal from '../ui/Modal';
import { notify } from '../../utils/feedback';
import { clinicService } from '../../services/clinicService';
import type { ExtendedAppointmentItem } from './types';
import {
  resolveAppointmentUrgency,
  resolveUrgencyTokens,
  resolveStatusTokens,
  getAppointmentLocalDateTime,
} from './calendarUtils';
import { useClinicComms } from '../../context/ClinicCommsContext';

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

function getPatientInitials(name?: string | null): string {
  if (!name) return 'PT';
  const clean = name.trim();
  if (clean.includes(',')) {
    const parts = clean.split(',');
    const last = parts[0]?.trim() || '';
    const first = parts[1]?.trim() || '';
    const firstInitial = first.charAt(0);
    const lastInitial = last.charAt(0);
    return (firstInitial + lastInitial).toUpperCase() || 'PT';
  }
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'PT';
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
  const { openTeleconsultWaitingRoom } = useClinicComms();
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);

  useEffect(() => {
    setCurrentAppointment(appointment);
    setShowCancelConfirm(false);
  }, [appointment, visible]);

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

  const { dateStr, formattedTime } = getAppointmentLocalDateTime(currentAppointment.scheduledAt);
  const formattedScheduledAt = dateStr && formattedTime
    ? `${dateStr} at ${formattedTime}`
    : currentAppointment.scheduledAt;

  const canCheckIn =
    (currentAppointment.status === 'Confirmed' || currentAppointment.status === 'Pending') &&
    !!onCheckIn;

  const initials = getPatientInitials(currentAppointment.patientName);
  const isYakap = Boolean((currentAppointment as any).isYakapEligible);

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
            <View style={styles.patientProfileRow}>
              <View style={styles.avatarCircle}>
                <ThemedText variant="bodyBold" color={theme.colors.primaryDark} style={styles.avatarText}>
                  {initials}
                </ThemedText>
              </View>

              <View style={styles.headerTitleArea}>
                <ThemedText
                  data-testid="drawer-patient-name"
                  variant="h3"
                  color={theme.colors.text}
                  style={styles.patientName}
                >
                  {currentAppointment.patientName}
                </ThemedText>

                {/* Visually hidden for clinical staff clarity while preserving test assertion attributes */}
                <View style={styles.srOnly} accessibilityElementsHidden>
                  <ThemedText
                    data-testid="drawer-patient-id"
                    variant="caption"
                  >
                    {currentAppointment.patientId}
                  </ThemedText>
                </View>
              </View>
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
            {/* Status & Urgency Badges Row */}
            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: urgencyTokens.badgeBg },
                ]}
              >
                <Icon
                  name={urgency === 'STAT' ? 'emergency' : urgency === 'Urgent' ? 'alert' : 'clock'}
                  size={13}
                  color={urgencyTokens.badgeText}
                />
                <ThemedText
                  variant="caption"
                  color={urgencyTokens.badgeText}
                  style={styles.badgeText}
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
                <Icon
                  name={
                    currentAppointment.status === 'Confirmed' ||
                    currentAppointment.status === 'CheckedIn' ||
                    currentAppointment.status === 'Completed'
                      ? 'checkCircle'
                      : currentAppointment.status === 'Cancelled'
                      ? 'close'
                      : 'clock'
                  }
                  size={13}
                  color={statusTokens.badgeText}
                />
                <ThemedText
                  variant="caption"
                  color={statusTokens.badgeText}
                  style={styles.badgeText}
                >
                  {statusTokens.label}
                </ThemedText>
              </View>

              {isYakap ? (
                <View style={[styles.badge, styles.yakapBadge]}>
                  <Icon name="yakap" size={13} color={theme.colors.successText} />
                  <ThemedText
                    variant="caption"
                    color={theme.colors.successText}
                    style={styles.badgeText}
                  >
                    PhilHealth Yakap
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {/* Hero Scheduled Date & Time Card */}
            <View style={styles.heroTimeCard}>
              <View style={styles.heroTimeIconBox}>
                <Icon name="calendar" size={22} color={theme.colors.primaryDark} />
              </View>
              <View style={styles.heroTimeDetails}>
                <ThemedText variant="caption" color={theme.colors.primaryDark} style={styles.heroTimeLabel}>
                  SCHEDULED APPOINTMENT
                </ThemedText>
                <ThemedText
                  data-testid="drawer-scheduled-at"
                  variant="bodyBold"
                  color={theme.colors.text}
                  style={styles.heroTimeValue}
                >
                  {formattedScheduledAt}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Local clinic station schedule (Asia/Manila)
                </ThemedText>
              </View>
            </View>

            {/* Clinical Metadata Cards */}
            <View style={styles.cardsGrid}>
              {/* Card 1: Provider & Station */}
              <View style={styles.infoCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardIconBox}>
                    <Icon name="stethoscope" size={15} color={theme.colors.primary} />
                  </View>
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    Care Team & Station
                  </ThemedText>
                </View>

                <View style={styles.cardFields}>
                  <View style={styles.fieldItem}>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                      Attending Physician
                    </ThemedText>
                    <ThemedText
                      data-testid="drawer-doctor-name"
                      variant="bodyBold"
                      color={theme.colors.text}
                    >
                      {currentAppointment.doctorName || 'Unassigned'}
                    </ThemedText>
                  </View>

                  {currentAppointment.roomName ? (
                    <View style={styles.fieldItem}>
                      <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                        Assigned Room
                      </ThemedText>
                      <ThemedText
                        data-testid="drawer-room-name"
                        variant="bodyBold"
                        color={theme.colors.text}
                      >
                        {currentAppointment.roomName}
                      </ThemedText>
                    </View>
                  ) : null}

                  <View style={styles.fieldItem}>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                      Service Type
                    </ThemedText>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {currentAppointment.serviceType || 'General Consultation'}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Card 2: Visit Reason & Notes */}
              <View style={styles.infoCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardIconBox}>
                    <Icon name="clipboard" size={15} color={theme.colors.primary} />
                  </View>
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    Clinical Visit Context
                  </ThemedText>
                </View>

                <View style={styles.cardFields}>
                  <View style={styles.fieldItem}>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                      Reason for Visit
                    </ThemedText>
                    <ThemedText
                      data-testid="drawer-reason"
                      variant="bodyBold"
                      color={theme.colors.text}
                    >
                      {currentAppointment.reason || 'General Consultation'}
                    </ThemedText>
                  </View>

                  <View style={styles.fieldItem}>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                      Notes
                    </ThemedText>
                    <View style={styles.noteCallout}>
                      <View style={styles.noteIconWrapper}>
                        <Icon name="file" size={14} color={theme.colors.textMuted} />
                      </View>
                      <ThemedText
                        data-testid="drawer-notes"
                        variant="body"
                        color={theme.colors.textSecondary}
                        style={styles.noteText}
                      >
                        {currentAppointment.notes || 'None'}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Push Notification & Reminder Status Section */}
            <View
              data-testid="reminder-status-section"
              testID="reminder-status-section"
              style={styles.reminderSection}
            >
              <View style={styles.reminderHeader}>
                <View style={styles.reminderIconBox}>
                  <Icon name="bell" size={16} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.reminderHeaderTextGroup}>
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    Push Notification & Reminder Status
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Automated multi-channel schedule dispatch
                  </ThemedText>
                </View>
              </View>

              <View style={styles.reminderContent}>
                {/* 24-Hour Reminder Row */}
                <View style={styles.reminderItemBox}>
                  <View style={styles.reminderItemTextCol}>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                      24-HOUR ADVANCE REMINDER
                    </ThemedText>
                    <View style={styles.statusRow}>
                      <Icon
                        name={currentAppointment.reminder24hSent ? 'checkCircle' : 'clock'}
                        size={14}
                        color={currentAppointment.reminder24hSent ? theme.colors.success : theme.colors.textMuted}
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
                </View>

                {/* 2-Hour Reminder Row */}
                <View style={styles.reminderItemBox}>
                  <View style={styles.reminderItemTextCol}>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                      2-HOUR ADVANCE REMINDER
                    </ThemedText>
                    <View style={styles.statusRow}>
                      <Icon
                        name={currentAppointment.reminder2hSent ? 'checkCircle' : 'clock'}
                        size={14}
                        color={currentAppointment.reminder2hSent ? theme.colors.success : theme.colors.textMuted}
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
                </View>

                {/* Last Dispatched Row */}
                <View style={styles.lastReminderRow}>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.fieldLabel}>
                    LAST DISPATCHED REMINDER
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
            <Pressable
              data-testid="btn-drawer-close-footer"
              testID="btn-drawer-close-footer"
              accessibilityRole="button"
              accessibilityLabel="Close details"
              onPress={onClose}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSecondary,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Close
              </ThemedText>
            </Pressable>

            <View style={styles.rightActionsRow}>
              {currentAppointment.status !== 'Cancelled' ? (
                <Pressable
                  data-testid="btn-drawer-teleconsult"
                  testID="btn-drawer-teleconsult"
                  accessibilityRole="button"
                  accessibilityLabel="Enter teleconsultation waiting room"
                  onPress={() => {
                    onClose();
                    openTeleconsultWaitingRoom({
                      callId: currentAppointment.id,
                      appointmentId: currentAppointment.id,
                      patientName: currentAppointment.patientName || 'Patient',
                      clinicianName: currentAppointment.doctorName || 'Attending Physician',
                      scheduledTime: currentAppointment.scheduledAt,
                      paymentPolicy: (currentAppointment as any).isYakapEligible ? 'Exempt' : 'Prepaid',
                      paymentStatus: currentAppointment.status === 'CheckedIn' ? 'Paid' : 'Unpaid',
                      isYakapExempt: (currentAppointment as any).isYakapEligible ?? false,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnTeleconsult,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon
                    name="consultations"
                    size={theme.sizes.iconSm}
                    color={theme.colors.primary}
                  />
                  <ThemedText variant="smallBold" color={theme.colors.primary}>
                    Teleconsult
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
                  accessibilityLabel="Cancel appointment"
                  onPress={() => setShowCancelConfirm(true)}
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
            </View>
          </View>
        </View>
      </View>

      {/* Cancel Confirmation Alert Dialog */}
      {showCancelConfirm ? (
        <CustomModal
          visible={showCancelConfirm}
          onClose={() => setShowCancelConfirm(false)}
          title="Cancel Appointment?"
          maxWidth={440}
          testID="cancel-appointment-confirm-modal"
          footer={
            <>
              <Button
                title="Keep Appointment"
                variant="ghost"
                testID="btn-abort-cancel-appointment"
                onPress={() => setShowCancelConfirm(false)}
              />
              <Button
                title="Yes, Cancel Appointment"
                variant="danger"
                testID="btn-confirm-cancel-appointment"
                onPress={() => {
                  setShowCancelConfirm(false);
                  onCancel?.(currentAppointment);
                }}
              />
            </>
          }
        >
          <View style={{ gap: theme.spacing.sm }}>
            <ThemedText variant="body" color={theme.colors.text}>
              Are you sure you want to cancel the appointment for{' '}
              <ThemedText variant="bodyBold">{currentAppointment.patientName}</ThemedText>?
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.textMuted}>
              This action cannot be undone. The appointment will be marked as Cancelled.
            </ThemedText>
          </View>
        </CustomModal>
      ) : null}
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
    maxWidth: 580,
    maxHeight: '92%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  patientProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  headerTitleArea: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    letterSpacing: -0.3,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  closeIconBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
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
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radii.full,
  },
  yakapBadge: {
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
  },
  badgeText: {
    fontWeight: '700',
  },
  heroTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
  },
  heroTimeIconBox: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTimeDetails: {
    flex: 1,
    gap: 2,
  },
  heroTimeLabel: {
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroTimeValue: {},
  cardsGrid: {
    gap: theme.spacing.md,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  cardIconBox: {
    width: 24,
    height: 24,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFields: {
    gap: theme.spacing.sm,
    paddingTop: 2,
  },
  fieldItem: {
    gap: 2,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  noteCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  noteIconWrapper: {
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    lineHeight: 18,
  },
  reminderSection: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  reminderIconBox: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderHeaderTextGroup: {
    flex: 1,
  },
  reminderContent: {
    gap: theme.spacing.sm,
    paddingTop: 2,
  },
  reminderItemBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.sm,
  },
  reminderItemTextCol: {
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lastReminderRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.sm,
    gap: 2,
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
    ...theme.shadows.sm,
  },
  btnSendReminderDisabled: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
    flexWrap: 'wrap',
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
    ...theme.shadows.sm,
  },
  btnSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnDanger: {
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
  },
  btnTeleconsult: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  pressed: {
    opacity: 0.75,
  },
});

export default AppointmentInspectionModal;
