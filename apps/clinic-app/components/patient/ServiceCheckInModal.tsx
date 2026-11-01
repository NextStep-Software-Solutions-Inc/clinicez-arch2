import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  ThemedText,
  Button,
  Badge,
  Icon,
  Modal,
  type IconName,
} from '../ui';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type ClinicPatient,
  type StaffMember,
  type QueuePriority,
  type VisitType,
  type PatientQueueItem,
} from '../../services/clinicService';
import { useStaff } from '../../context/StaffContext';
import { notify } from '../../utils/feedback';
import {
  getPatientInitials,
  hasKnownAllergies,
  hasStatAllergy,
  formatPatientDemographicsLine,
  type ClinicalServiceType,
} from './PatientDirectoryCard';

export { ClinicalServiceType };

export interface ServiceCheckInPayload {
  patientId: string;
  patientName: string;
  doctorId?: string;
  doctorName?: string;
  roomId?: string;
  roomOrStation?: string;
  priority: QueuePriority;
  visitType: VisitType | string;
  chiefComplaint: string;
  seriesPrefix: string;
  queueDate?: string;
  allowDuplicateActive?: boolean;
}

export interface ServiceCheckInModalProps {
  visible: boolean;
  patient: ClinicPatient | null;
  initialService?: ClinicalServiceType;
  activeDoctors?: StaffMember[];
  activeRooms?: Array<{ id: string; name: string; isActive?: boolean }>;
  onClose: () => void;
  onConfirm?: (payload: ServiceCheckInPayload) => Promise<PatientQueueItem | null | void> | PatientQueueItem | null | void;
  onSuccess?: (ticketNumber?: string) => void;
  onNavigateToDashboard?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Derives patient age in full years from date of birth string.
 */
export function calculateAge(dobString?: string | null, referenceDate = new Date('2026-10-31T00:00:00Z')): number {
  if (!dobString) return 0;
  const dob = new Date(dobString);
  let age = referenceDate.getFullYear() - dob.getFullYear();
  const m = referenceDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && referenceDate.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Evaluates whether a patient qualifies for Senior & PWD Priority queueing.
 * Plain clinical rule: Age >= 60 OR valid Senior Citizen ID OR valid PWD ID.
 */
export function isSeniorOrPwdEligible(
  patient: Pick<ClinicPatient, 'age' | 'dateOfBirth' | 'seniorCitizenId' | 'pwdId' | 'customFields'> | null | undefined
): boolean {
  if (!patient) return false;
  if (patient.seniorCitizenId && patient.seniorCitizenId.trim().length > 0) return true;
  if (patient.pwdId && patient.pwdId.trim().length > 0) return true;
  if (
    patient.customFields?.seniorCitizenId ||
    patient.customFields?.senior_id ||
    patient.customFields?.pwdId ||
    patient.customFields?.pwd_id
  ) {
    return true;
  }
  const age = patient.age !== undefined && patient.age !== null ? patient.age : calculateAge(patient.dateOfBirth);
  return age >= 60;
}

/**
 * Resolves Ticket Prefix based on Service Type and Priority Status.
 * Regular: Q, V, P, A
 * Priority (Senior & PWD): SQ, SV, SP, SA
 */
export function resolveTicketPrefix(serviceType: ClinicalServiceType, isPriority: boolean): string {
  switch (serviceType) {
    case 'Doctor Consultation':
      return isPriority ? 'SQ' : 'Q';
    case 'Vitals Check':
      return isPriority ? 'SV' : 'V';
    case 'Clinical Procedure':
      return isPriority ? 'SP' : 'P';
    case 'Administrative & Clearance':
      return isPriority ? 'SA' : 'A';
    default:
      return isPriority ? 'SQ' : 'Q';
  }
}

/**
 * Formats standard 3-digit queue ticket string.
 */
export function formatQueueTicketNumber(prefix: string, sequence: number = 1): string {
  const normalizedPrefix = prefix.toUpperCase();
  const seqStr = String(sequence).padStart(3, '0');
  return `${normalizedPrefix}-${seqStr}`;
}

export const CLINICAL_SERVICES: Array<{
  type: ClinicalServiceType;
  label: string;
  icon: IconName;
  hint: string;
  visitType: VisitType | string;
  defaultPrefixRegular: string;
  defaultPrefixPriority: string;
}> = [
  {
    type: 'Doctor Consultation',
    label: 'Doctor Consultation',
    icon: 'stethoscope',
    hint: 'Physician evaluation, SOAP & prescription',
    visitType: 'Consultation',
    defaultPrefixRegular: 'Q',
    defaultPrefixPriority: 'SQ',
  },
  {
    type: 'Vitals Check',
    label: 'Vitals Check',
    icon: 'activity',
    hint: 'Triage BP, HR, SpO2 & physical exam',
    visitType: 'VitalsCheckOnly',
    defaultPrefixRegular: 'V',
    defaultPrefixPriority: 'SV',
  },
  {
    type: 'Clinical Procedure',
    label: 'Clinical Procedure',
    icon: 'syringe',
    hint: 'Minor wound care, injections & dressing',
    visitType: 'StandaloneProcedure',
    defaultPrefixRegular: 'P',
    defaultPrefixPriority: 'SP',
  },
  {
    type: 'Administrative & Clearance',
    label: 'Administrative & Clearance',
    icon: 'file',
    hint: 'Medical certificates, clearance & forms',
    visitType: 'AdministrativeDocument',
    defaultPrefixRegular: 'A',
    defaultPrefixPriority: 'SA',
  },
];

export default function ServiceCheckInModal({
  visible,
  patient,
  initialService = 'Doctor Consultation',
  onClose,
  onConfirm,
  onSuccess,
  onNavigateToDashboard,
}: ServiceCheckInModalProps) {
  // Priority series evaluation
  const isSeniorOrPwd = useMemo(() => isSeniorOrPwdEligible(patient), [patient]);

  // Selected Service
  const [selectedService, setSelectedService] = useState<ClinicalServiceType>(initialService);

  // Ticket Series Preference: defaults to Priority series if Senior/PWD eligible
  const [isPrioritySeries, setIsPrioritySeries] = useState<boolean>(isSeniorOrPwd);

  // Loading State
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Active Queue Conflict Warning State
  const [conflictWarning, setConflictWarning] = useState<{
    queueNumber: string;
    status: string;
    patientName: string;
    payload: ServiceCheckInPayload;
  } | null>(null);

  // Issued Ticket Confirmation State (Post-Queue Dialog)
  const [issuedTicket, setIssuedTicket] = useState<{
    queueNumber: string;
    serviceType: ClinicalServiceType;
    patientName: string;
  } | null>(null);

  // Reset or initialize state whenever patient or initialService changes
  useEffect(() => {
    if (visible && patient) {
      const eligible = isSeniorOrPwdEligible(patient);
      setIsPrioritySeries(eligible);
      setSelectedService(initialService);
      setConflictWarning(null);
      setIssuedTicket(null);
    }
  }, [visible, patient, initialService]);

  // Ticket prefix
  const currentPrefix = useMemo(() => {
    return resolveTicketPrefix(selectedService, isPrioritySeries);
  }, [selectedService, isPrioritySeries]);

  const handleCloseAll = useCallback(() => {
    setConflictWarning(null);
    setIssuedTicket(null);
    onClose();
  }, [onClose]);

  // Submission handler
  const handleConfirm = async (overridePayload?: ServiceCheckInPayload, allowDuplicate = false) => {
    if (!patient || submitting) return;

    const serviceConfig = CLINICAL_SERVICES.find((s) => s.type === selectedService)!;
    const payload: ServiceCheckInPayload = overridePayload || {
      patientId: patient.id,
      patientName: patient.fullName,
      priority: 'Routine',
      visitType: serviceConfig.visitType,
      chiefComplaint: serviceConfig.label,
      seriesPrefix: currentPrefix,
      allowDuplicateActive: allowDuplicate,
    };

    // If patient already has an active queue ticket and staff has not confirmed duplicate override, warn staff immediately
    if (!allowDuplicate && patient.activeQueueTicket) {
      setConflictWarning({
        queueNumber: patient.activeQueueTicket,
        status: (patient as any).activeQueueStatus || (patient as any).verificationStatus || 'In queue',
        patientName: patient.fullName,
        payload,
      });
      return;
    }

    setSubmitting(true);

    try {
      let result: PatientQueueItem | null = null;
      let conflictErr: any = null;

      if (onConfirm) {
        try {
          const maybeResult = await onConfirm(payload);
          if (maybeResult && (maybeResult as any).queueNumber) {
            result = maybeResult as PatientQueueItem;
          }
        } catch (err: any) {
          const isConflict =
            err?.status === 409 ||
            err?.errorCode === 'CONFLICT' ||
            err?.errorCode === 'active_queue_ticket_exists' ||
            err?.message?.toLowerCase().includes('already checked in');

          if (isConflict && !allowDuplicate) {
            conflictErr = err;
          } else {
            throw err;
          }
        }
      } else {
        const [res, err] = await clinicService.checkInPatient(payload);
        if (err) {
          const isConflict =
            err?.status === 409 ||
            err?.errorCode === 'CONFLICT' ||
            err?.errorCode === 'active_queue_ticket_exists' ||
            err?.message?.toLowerCase().includes('already checked in');

          if (isConflict && !allowDuplicate) {
            conflictErr = err;
          } else {
            throw err;
          }
        } else if (res) {
          result = res;
        }
      }

      if (conflictErr) {
        const msg = conflictErr.message || '';
        const match = msg.match(/is already checked in as\s+([^\s(]+)\s*\(([^)]+)\)/i);
        const ticketNumber = match ? match[1] : (conflictErr.activeQueueTicket || conflictErr.queueNumber || patient.activeQueueTicket || 'Existing Ticket');
        const queueStatus = match ? match[2] : 'Waiting';

        setConflictWarning({
          queueNumber: ticketNumber,
          status: queueStatus,
          patientName: patient.fullName,
          payload,
        });
        return;
      }

      if (result) {
        setConflictWarning(null);
        setIssuedTicket({
          queueNumber: result.queueNumber,
          serviceType: selectedService,
          patientName: patient.fullName,
        });
        onSuccess?.(result.queueNumber);
      }
    } catch (e: any) {
      const isConflict =
        e?.status === 409 ||
        e?.errorCode === 'CONFLICT' ||
        e?.errorCode === 'active_queue_ticket_exists' ||
        e?.message?.toLowerCase().includes('already checked in');

      if (isConflict && !allowDuplicate) {
        const msg = e.message || '';
        const match = msg.match(/is already checked in as\s+([^\s(]+)\s*\(([^)]+)\)/i);
        const ticketNumber = match ? match[1] : (e.activeQueueTicket || e.queueNumber || patient.activeQueueTicket || 'Existing Ticket');
        const queueStatus = match ? match[2] : 'Waiting';

        setConflictWarning({
          queueNumber: ticketNumber,
          status: queueStatus,
          patientName: patient.fullName,
          payload,
        });
      } else {
        notify.error(e?.message || 'Check-in failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible || !patient) return null;

  const initials = getPatientInitials(patient);
  const demographicsLine = formatPatientDemographicsLine(patient);
  const hasAllergies = hasKnownAllergies(patient.allergies);
  const isStat = hasStatAllergy(patient.allergies);

  // 1. Post-Queue Confirmation Dialog
  if (issuedTicket) {
    return (
      <Modal
        visible={visible}
        onClose={handleCloseAll}
        title="Ticket Issued"
        subtitle="Patient is waiting in queue"
        testID="post-queue-dialog"
      >
        <View style={styles.postQueueWrap}>
          <View style={styles.postQueueSuccessBadge}>
            <Icon name="checkCircle" size={32} color={theme.colors.routineText} />
          </View>

          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.postQueueLabel}>
            QUEUE TICKET NUMBER
          </ThemedText>
          <View style={styles.postQueueTicketBox}>
            <ThemedText variant="display" color={theme.colors.primaryDark} style={styles.postQueueTicketNumber}>
              {issuedTicket.queueNumber}
            </ThemedText>
          </View>

          <View style={styles.postQueuePatientDetails}>
            <ThemedText variant="title" color={theme.colors.text}>
              {issuedTicket.patientName}
            </ThemedText>
            <View style={styles.postQueueBadgeRow}>
              <Badge label={issuedTicket.serviceType} variant="routine" size="sm" />
              <Badge label="Waiting in queue" variant="outline" size="sm" icon="clock" />
            </View>
          </View>

          <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.postQueueHint}>
            The patient has been added to the workstation queue. You can view their progress on the dashboard.
          </ThemedText>

          <View style={styles.postQueueActions}>
            <Button
              title="Done"
              variant="outline"
              size="lg"
              onPress={handleCloseAll}
              style={styles.postQueueButton}
              testID="post-queue-done-button"
            />
            {onNavigateToDashboard ? (
              <Button
                title="View on Dashboard"
                variant="primary"
                size="lg"
                icon="arrowRight"
                onPress={() => {
                  handleCloseAll();
                  onNavigateToDashboard();
                }}
                style={styles.postQueueButton}
                testID="post-queue-dashboard-button"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    );
  }

  // 2. Active Queue Warning Dialog
  if (conflictWarning) {
    return (
      <Modal
        visible={visible}
        onClose={() => setConflictWarning(null)}
        title="Patient Already in Queue"
        subtitle="Active visit detected"
        testID="active-queue-warning-dialog"
      >
        <View style={styles.conflictWrap}>
          <View style={styles.conflictWarningCard}>
            <View style={styles.conflictIconRow}>
              <View style={styles.conflictIconBadge}>
                <Icon name="alert" size={24} color={theme.colors.warningText} />
              </View>
              <View style={styles.conflictTextWrap}>
                <ThemedText variant="bodyBold" color={theme.colors.warningText}>
                  Active Queue Ticket Found
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.text}>
                  {conflictWarning.patientName} is already checked in for today:
                </ThemedText>
                <View style={styles.conflictTicketPill}>
                  <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                    Ticket {conflictWarning.queueNumber} • {conflictWarning.status}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>

          <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.conflictPrompt}>
            A patient typically has one active ticket at a time. Do you want to continue and issue an additional queue ticket for this patient?
          </ThemedText>

          <View style={styles.modalFooter}>
            <Button
              title="Go back"
              variant="ghost"
              onPress={() => setConflictWarning(null)}
              disabled={submitting}
              testID="conflict-go-back-button"
            />
            <Button
              title="Continue queueing"
              variant="primary"
              icon="ticket"
              loading={submitting}
              onPress={() => handleConfirm(conflictWarning.payload, true)}
              testID="conflict-continue-button"
            />
          </View>
        </View>
      </Modal>
    );
  }

  // 3. Main Simplified Selection Dialog
  const modalFooter = (
    <View style={styles.modalFooter}>
      <Button
        title="Cancel"
        variant="ghost"
        onPress={onClose}
        disabled={submitting}
        testID="cancel-check-in-button"
      />
      <Button
        title="Continue"
        variant="primary"
        icon="arrowRight"
        loading={submitting}
        onPress={() => handleConfirm()}
        testID="confirm-check-in-button"
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Queue Patient"
      subtitle="Select clinical service and ticket series"
      footer={modalFooter}
      testID="service-checkin-modal"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Patient Identity Banner */}
        <View style={styles.patientBanner}>
          <View style={styles.avatarWrap}>
            <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
              {initials}
            </ThemedText>
          </View>
          <View style={styles.patientInfoCol}>
            <View style={styles.nameRow}>
              <ThemedText variant="bodyBold" color={theme.colors.text} style={styles.patientName}>
                {patient.fullName}
              </ThemedText>
              <Badge label={patient.patientCode} variant="outline" size="sm" />
            </View>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              {demographicsLine}
            </ThemedText>

            {hasAllergies || patient.alerts ? (
              <View style={styles.alertStripsRow}>
                {hasAllergies ? (
                  <View style={[styles.compactNoticeStrip, isStat ? styles.statStrip : styles.allergyStrip]}>
                    <Icon
                      name="alert"
                      size={theme.sizes.iconSm}
                      color={isStat ? theme.colors.emergencyText : theme.colors.urgentText}
                    />
                    <ThemedText
                      variant="captionBold"
                      color={isStat ? theme.colors.emergencyText : theme.colors.urgentText}
                      numberOfLines={1}
                    >
                      {patient.allergies}
                    </ThemedText>
                  </View>
                ) : null}
                {patient.alerts ? (
                  <View style={[styles.compactNoticeStrip, styles.alertStrip]}>
                    <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                    <ThemedText variant="captionBold" color={theme.colors.warningText} numberOfLines={1}>
                      {patient.alerts}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* 1. Service Intent Selector */}
        <View style={styles.formSection}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
            SELECT CLINICAL SERVICE
          </ThemedText>
          <View style={styles.serviceCardsGrid}>
            {CLINICAL_SERVICES.map((srv) => {
              const isSelected = selectedService === srv.type;
              return (
                <Pressable
                  key={srv.type}
                  accessibilityRole="button"
                  accessibilityLabel={srv.label}
                  testID={`service-tab-${srv.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onPress={() => setSelectedService(srv.type)}
                  style={[
                    styles.serviceCard,
                    isSelected ? styles.serviceCardSelected : styles.serviceCardUnselected,
                  ]}
                >
                  <View style={styles.serviceCardHeader}>
                    <View
                      style={[
                        styles.serviceIconWrap,
                        isSelected ? styles.serviceIconWrapSelected : styles.serviceIconWrapUnselected,
                      ]}
                    >
                      <Icon
                        name={srv.icon}
                        size={theme.sizes.iconMd}
                        color={isSelected ? theme.colors.primaryDark : theme.colors.textMuted}
                      />
                    </View>
                    <ThemedText
                      variant="smallBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                    >
                      {srv.label}
                    </ThemedText>
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={2}>
                    {srv.hint}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 2. Ticket Series Selection & Preview */}
        <View style={styles.formSection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
              QUEUE TICKET SERIES
            </ThemedText>
            <View style={styles.ticketPreviewBadge} testID="ticket-series-preview">
              <Icon name="ticket" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                {isPrioritySeries ? 'Senior & PWD Priority' : 'Regular Series'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.chipsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Regular Queue Series"
              testID="series-regular-chip"
              onPress={() => setIsPrioritySeries(false)}
              style={[
                styles.chip,
                !isPrioritySeries ? styles.chipSelected : styles.chipUnselected,
              ]}
            >
              <ThemedText
                variant="smallBold"
                color={!isPrioritySeries ? theme.colors.primaryDark : theme.colors.text}
              >
                Regular Queue Series
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Senior & PWD Priority Series"
              testID="series-priority-chip"
              onPress={() => setIsPrioritySeries(true)}
              style={[
                styles.chip,
                isPrioritySeries ? styles.chipSelected : styles.chipUnselected,
              ]}
            >
              <ThemedText
                variant="smallBold"
                color={isPrioritySeries ? theme.colors.primaryDark : theme.colors.text}
              >
                Senior & PWD Priority
              </ThemedText>
            </Pressable>
          </View>

          {isSeniorOrPwd && isPrioritySeries ? (
            <View style={styles.priorityBanner}>
              <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.routineText} />
              <ThemedText variant="captionBold" color={theme.colors.routineText}>
                Senior & PWD Priority Series auto-selected for this patient.
              </ThemedText>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
  },
  patientBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfoCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  patientName: {
    fontSize: theme.typography.body.fontSize,
  },
  alertStripsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: 4,
  },
  compactNoticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: theme.radii.sm,
  },
  allergyStrip: {
    backgroundColor: theme.colors.urgentBg,
  },
  statStrip: {
    backgroundColor: theme.colors.emergencyBg,
  },
  alertStrip: {
    backgroundColor: theme.colors.warningBg,
  },
  formSection: {
    gap: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLabel: {
    letterSpacing: 0.5,
  },
  ticketPreviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radii.sm,
  },
  serviceCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  serviceCard: {
    flex: 1,
    minWidth: 140,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1.5,
    gap: 4,
  },
  serviceCardSelected: {
    borderColor: theme.colors.primaryDark,
    backgroundColor: theme.colors.primaryLight,
  },
  serviceCardUnselected: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  serviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  serviceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceIconWrapSelected: {
    backgroundColor: theme.colors.surface,
  },
  serviceIconWrapUnselected: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryDark,
  },
  chipUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  priorityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.routineBg,
    borderRadius: theme.radii.sm,
    marginTop: 4,
  },
  postQueueWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  postQueueSuccessBadge: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.routineBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  postQueueLabel: {
    letterSpacing: 1,
  },
  postQueueTicketBox: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: theme.colors.primaryDark,
  },
  postQueueTicketNumber: {
    fontSize: theme.fontSizes['4xl'],
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  postQueuePatientDetails: {
    alignItems: 'center',
    gap: 6,
  },
  postQueueBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  postQueueHint: {
    textAlign: 'center',
    maxWidth: 380,
    marginTop: theme.spacing.xs,
  },
  postQueueActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    width: '100%',
    justifyContent: 'center',
  },
  postQueueButton: {
    minWidth: 140,
  },
  conflictWrap: {
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  conflictWarningCard: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.warningBorder,
  },
  conflictIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  conflictIconBadge: {
    marginTop: 2,
  },
  conflictTextWrap: {
    flex: 1,
    gap: 6,
  },
  conflictTicketPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  conflictPrompt: {
    lineHeight: 20,
  },
});
