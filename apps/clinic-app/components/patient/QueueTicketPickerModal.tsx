import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Modal, ThemedText, Badge, Button, Icon } from '@ui';
import { theme } from '@constants/theme';
import type { ClinicPatient, PatientActiveQueueTicket, PatientQueueItem } from '../../services/clinicService';
import { getPatientInitials, formatPatientDemographicsLine } from './PatientDirectoryCard';

export interface QueueTicketPickerModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  tickets: Array<PatientQueueItem | PatientActiveQueueTicket>;
  serviceTitle?: string;
  onSelectTicket: (ticket: PatientQueueItem | PatientActiveQueueTicket) => void;
  onCreateNewTicket?: () => void;
}

export default function QueueTicketPickerModal({
  visible,
  onClose,
  patient,
  tickets,
  serviceTitle = 'Encounter',
  onSelectTicket,
  onCreateNewTicket,
}: QueueTicketPickerModalProps) {
  if (!patient || !visible) return null;

  const initials = getPatientInitials(patient);
  const demographics = formatPatientDemographicsLine(patient);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Select Queue Ticket"
      subtitle={`${patient.fullName} has ${tickets.length} active tickets`}
      testID="queue-ticket-picker-modal"
    >
      <View style={styles.container}>
        {/* Patient Identity Banner */}
        <View style={styles.patientBanner}>
          <View style={styles.avatarCircle}>
            <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
              {initials}
            </ThemedText>
          </View>
          <View style={styles.patientInfo}>
            <View style={styles.patientHeaderRow}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {patient.fullName}
              </ThemedText>
              <Badge label={patient.patientCode} variant="neutral" size="sm" />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
              {demographics}
            </ThemedText>
          </View>
        </View>

        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionTitle}>
          ACTIVE TICKETS AVAILABLE ({tickets.length})
        </ThemedText>

        <View style={styles.ticketList}>
          {tickets.map((t, idx) => {
            const isWaiting = t.status === 'Waiting';
            const isInConsult = t.status === 'InConsultation';
            const statusVariant = isInConsult ? 'primary' : isWaiting ? 'routine' : 'info';
            const ticketId = (t as any).id || t.queueNumber || `ticket-${idx}`;

            return (
              <Pressable
                key={ticketId}
                style={({ pressed, hovered }: any) => [
                  styles.ticketCard,
                  (pressed || hovered) && styles.ticketCardActive,
                ]}
                onPress={() => onSelectTicket(t)}
                accessibilityRole="button"
                accessibilityLabel={`Select ticket ${t.queueNumber}`}
                testID={`ticket-choice-${t.queueNumber}`}
              >
                <View style={styles.ticketIconCircle}>
                  <Icon name="ticket" size={24} color={theme.colors.primary} />
                </View>

                <View style={styles.ticketCardContent}>
                  <View style={styles.ticketHeaderRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                      Ticket {t.queueNumber}
                    </ThemedText>
                    <Badge label={String(t.status)} variant={statusVariant} size="sm" />
                  </View>

                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Channel: {String(t.visitType || serviceTitle)}
                    {t.doctorName ? ` • Doctor: ${t.doctorName}` : ''}
                  </ThemedText>

                  {t.chiefComplaint ? (
                    <ThemedText variant="small" color={theme.colors.text} numberOfLines={1}>
                      Complaint: {t.chiefComplaint}
                    </ThemedText>
                  ) : null}
                </View>

                <View style={styles.selectBtnBadge}>
                  <ThemedText variant="captionBold" color={theme.colors.primary}>
                    Select
                  </ThemedText>
                  <Icon name="chevronRight" size={16} color={theme.colors.primary} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footerRow}>
          {onCreateNewTicket ? (
            <Button
              title="Issue new ticket instead"
              variant="outline"
              icon="plus"
              onPress={onCreateNewTicket}
              testID="ticket-picker-create-new-btn"
            />
          ) : null}
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            testID="ticket-picker-cancel-btn"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  patientBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  patientHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    letterSpacing: 0.5,
    marginTop: theme.spacing.xs,
  },
  ticketList: {
    gap: theme.spacing.sm,
  },
  ticketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  ticketCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  ticketIconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCardContent: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  selectBtnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
