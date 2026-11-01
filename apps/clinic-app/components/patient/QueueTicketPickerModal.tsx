import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Modal, ThemedText, Badge, Button, Icon } from '@ui';
import { theme } from '@constants/theme';
import type { ClinicPatient, PatientActiveQueueTicket, PatientQueueItem } from '../../services/clinicService';
import { getPatientInitials, formatPatientDemographicsLine } from './PatientDirectoryCard';
import {
  formatQueueStatusMeta,
  formatVisitTypeMeta,
  formatTicketSubtext,
} from './ServiceCheckInModal';

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

  const footerContent = (
    <View style={styles.footerRow}>
      <Button
        title="Cancel"
        variant="ghost"
        onPress={onClose}
        testID="ticket-picker-cancel-btn"
      />
      {onCreateNewTicket ? (
        <Button
          title="Issue new ticket instead"
          variant="outline"
          icon="plus"
          onPress={onCreateNewTicket}
          testID="ticket-picker-create-new-btn"
        />
      ) : null}
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Select Queue Ticket"
      subtitle={`${patient.fullName} has ${tickets.length} active tickets`}
      maxWidth={520}
      footer={footerContent}
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
              <Badge label={patient.patientCode} variant="outline" size="sm" />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
              {demographics}
            </ThemedText>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionTitle}>
            ACTIVE TICKETS AVAILABLE ({tickets.length})
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Tap a ticket to attend
          </ThemedText>
        </View>

        <View style={styles.ticketList}>
          {tickets.map((t, idx) => {
            const statusMeta = formatQueueStatusMeta(String(t.status));
            const visitMeta = formatVisitTypeMeta(String(t.visitType || serviceTitle));
            const subtext = formatTicketSubtext(
              {
                visitType: String(t.visitType || serviceTitle),
                chiefComplaint: t.chiefComplaint,
                doctorName: t.doctorName,
                checkInTime: (t as any).checkInTime,
                status: String(t.status),
              },
              visitMeta.label
            );
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
                <View style={styles.ticketBadgeBox}>
                  <Icon name="ticket" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                  <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
                    {t.queueNumber}
                  </ThemedText>
                </View>

                <View style={styles.ticketCardContent}>
                  <View style={styles.ticketHeaderRow}>
                    <ThemedText variant="smallBold" color={theme.colors.text} numberOfLines={1}>
                      {visitMeta.label}
                    </ThemedText>
                    <Badge
                      label={statusMeta.label}
                      variant={statusMeta.variant}
                      size="sm"
                      icon={statusMeta.icon}
                    />
                  </View>

                  <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                    {subtext}
                  </ThemedText>
                </View>

                <View style={styles.selectBtnBadge}>
                  <ThemedText variant="captionBold" color={theme.colors.primary}>
                    Select
                  </ThemedText>
                  <Icon name="chevronRight" size={theme.sizes.iconSm} color={theme.colors.primary} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  patientBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
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
    flexShrink: 0,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    letterSpacing: 0.5,
  },
  ticketList: {
    gap: theme.spacing.sm,
  },
  ticketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  ticketCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLighter,
  },
  ticketBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    minWidth: 82,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.primaryLighter,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
  },
  ticketCardContent: {
    flex: 1,
    gap: 2,
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
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
});
