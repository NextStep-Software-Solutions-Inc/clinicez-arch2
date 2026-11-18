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
  type BadgeVariant,
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
import { useClinic } from '../../context/ClinicContext';
import { notify } from '../../utils/feedback';
import { printThermalQueueTicket } from '../../utils/printHelper';
import {
  formatPatientDemographicsLine,
} from './PatientDirectoryCard';

export type { VisitType };

export interface ServiceCheckInPayload {
  patientId: string;
  patientName: string;
  doctorId?: string;
  doctorName?: string;
  roomId?: string;
  roomOrStation?: string;
  priority: QueuePriority;
  visitType: VisitType;
  chiefComplaint: string;
  seriesPrefix: string;
  queueDate?: string;
  allowDuplicateActive?: boolean;
}

export interface ConflictActiveTicketSummary {
  queueNumber: string;
  status: string;
  visitType?: string;
  chiefComplaint?: string;
  doctorName?: string;
  checkInTime?: string;
}

export interface ServiceCheckInModalProps {
  visible: boolean;
  patient: ClinicPatient | null;
  initialVisitType?: VisitType;
  activeDoctors?: StaffMember[];
  activeRooms?: Array<{ id: string; name: string; isActive?: boolean }>;
  onClose: () => void;
  onConfirm?: (payload: ServiceCheckInPayload) => Promise<PatientQueueItem | null | void> | PatientQueueItem | null | void;
  onSuccess?: (ticketNumber?: string) => void;
  onNavigateToDashboard?: () => void;
  initialConflictWarning?: {
    queueNumber: string;
    status: string;
    patientName: string;
    payload: ServiceCheckInPayload;
    activeTickets?: ConflictActiveTicketSummary[];
  } | null;
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
  patient: Partial<Pick<ClinicPatient, 'age' | 'dateOfBirth' | 'seniorCitizenId' | 'pwdId' | 'customFields'>> | null | undefined
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
 * Resolves Ticket Prefix based on VisitType and Priority Status.
 * Regular: Q, F, V, U
 * Priority (Senior & PWD): SQ, SF, SV, SU
 */
export function resolveTicketPrefix(visitType: VisitType | string, isPriority: boolean): string {
  switch (visitType) {
    case 'RoutineCheckup':
    case 'Routine Checkup':
    case 'AcuteIllnessConsultation':
    case 'Acute Illness Consultation':
      return isPriority ? 'SQ' : 'Q';
    case 'ChronicDiseaseFollowUp':
    case 'Chronic Disease Follow-Up':
      return isPriority ? 'SF' : 'F';
    case 'PreventiveHealthAssessment':
    case 'Preventive Health Assessment':
      return isPriority ? 'SV' : 'V';
    case 'UrgentCareVisit':
    case 'Urgent Care Visit':
      return isPriority ? 'SU' : 'U';
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

/**
 * Maps raw QueueStatus strings to clinical workstation labels, Badge variants, and icons.
 */
export function formatQueueStatusMeta(status?: string | null): {
  label: string;
  variant: BadgeVariant;
  icon: IconName;
} {
  const normalized = String(status || 'Waiting').trim();
  switch (normalized) {
    case 'InConsultation':
      return { label: 'In Consultation', variant: 'info', icon: 'stethoscope' };
    case 'Called':
      return { label: 'Called to Room', variant: 'info', icon: 'bell' };
    case 'InTriage':
      return { label: 'In Triage', variant: 'warning', icon: 'heartPulse' };
    case 'Sidelined':
    case 'Deferred':
      return { label: 'On Hold', variant: 'warning', icon: 'hourglass' };
    case 'PendingVerification':
      return { label: 'Pending Verification', variant: 'warning', icon: 'hourglass' };
    case 'Verified':
      return { label: 'Checked In', variant: 'routine', icon: 'checkCircle' };
    case 'Waiting':
      return { label: 'Waiting', variant: 'routine', icon: 'clock' };
    default: {
      const humanized = normalized.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
      return { label: humanized || 'In Queue', variant: 'routine', icon: 'clock' };
    }
  }
}

/**
 * Maps VisitType enum strings to human-readable clinical purpose labels and icons.
 */
export function formatVisitTypeMeta(visitType?: string | null): {
  label: string;
  icon: IconName;
} {
  const normalized = String(visitType || 'RoutineCheckup').trim();
  switch (normalized) {
    case 'RoutineCheckup':
    case 'Routine Checkup':
      return { label: 'Routine Checkup', icon: 'stethoscope' };
    case 'AcuteIllnessConsultation':
    case 'Acute Illness Consultation':
      return { label: 'Acute Illness Consultation', icon: 'activity' };
    case 'ChronicDiseaseFollowUp':
    case 'Chronic Disease Follow-Up':
      return { label: 'Chronic Disease Follow-Up', icon: 'refresh' };
    case 'PreventiveHealthAssessment':
    case 'Preventive Health Assessment':
      return { label: 'Preventive Health Assessment', icon: 'heartPulse' };
    case 'UrgentCareVisit':
    case 'Urgent Care Visit':
      return { label: 'Urgent Care Visit', icon: 'emergency' };
    default:
      return { label: '', icon: 'clipboard' };
  }
}

/**
 * Builds non-redundant secondary metadata for an active ticket card
 * (chief complaint if distinct from generic visit purpose label, assigned clinician, check-in time).
 */
export function formatTicketSubtext(
  ticket: {
    visitType?: string | null;
    chiefComplaint?: string | null;
    doctorName?: string | null;
    checkInTime?: string | null;
    status?: string | null;
  },
  resolvedVisitLabel: string
): string {
  const parts: string[] = [];
  const rawComplaint = (ticket.chiefComplaint || '').trim();
  const genericLabels = new Set([
    resolvedVisitLabel.toLowerCase(),
    String(ticket.visitType || '').trim().toLowerCase(),
    'routine checkup',
    'acute illness consultation',
    'chronic disease follow-up',
    'preventive health assessment',
    'urgent care visit',
    'general consultation',
    'clinical',
  ]);

  if (rawComplaint && !genericLabels.has(rawComplaint.toLowerCase())) {
    parts.push(rawComplaint);
  }
  if (ticket.doctorName && ticket.doctorName.trim()) {
    const dr = ticket.doctorName.trim();
    parts.push(dr.startsWith('Dr.') ? dr : `Dr. ${dr}`);
  }
  if (ticket.checkInTime) {
    const parsedDate = new Date(ticket.checkInTime);
    if (!Number.isNaN(parsedDate.getTime())) {
      try {
        const timeStr = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Manila',
        }).format(parsedDate);
        parts.push(`Checked in ${timeStr}`);
      } catch {
        // Fallback silently if Intl timezone is unsupported
      }
    }
  }

  if (parts.length > 0) {
    return parts.join(' • ');
  }

  if (ticket.status === 'InConsultation') return 'With doctor';
  if (ticket.status === 'InTriage') return 'At triage';
  if (ticket.status === 'Called') return 'Called to room';
  return 'Waiting in queue';
}

export const VISIT_TYPE_OPTIONS: Array<{
  visitType: VisitType;
  label: string;
  icon: IconName;
  hint: string;
  defaultPrefixRegular: string;
  defaultPrefixPriority: string;
}> = [
  {
    visitType: 'RoutineCheckup',
    label: 'Routine Checkup',
    icon: 'stethoscope',
    hint: 'General wellness exam, physical checkup, or clearance',
    defaultPrefixRegular: 'Q',
    defaultPrefixPriority: 'SQ',
  },
  {
    visitType: 'AcuteIllnessConsultation',
    label: 'Acute Illness Consultation',
    icon: 'activity',
    hint: 'New symptoms, fever, cough, pain, or sudden illness',
    defaultPrefixRegular: 'Q',
    defaultPrefixPriority: 'SQ',
  },
  {
    visitType: 'ChronicDiseaseFollowUp',
    label: 'Chronic Disease Follow-Up',
    icon: 'refresh',
    hint: 'Ongoing condition monitoring, lab review, or refill',
    defaultPrefixRegular: 'F',
    defaultPrefixPriority: 'SF',
  },
  {
    visitType: 'PreventiveHealthAssessment',
    label: 'Preventive Health Assessment',
    icon: 'heartPulse',
    hint: 'Vital signs monitoring, health screening, or nursing care',
    defaultPrefixRegular: 'V',
    defaultPrefixPriority: 'SV',
  },
  {
    visitType: 'UrgentCareVisit',
    label: 'Urgent Care Visit',
    icon: 'emergency',
    hint: 'Immediate clinical evaluation for urgent symptoms or injury',
    defaultPrefixRegular: 'U',
    defaultPrefixPriority: 'SU',
  },
];

export default function ServiceCheckInModal({
  visible,
  patient,
  initialVisitType = 'RoutineCheckup',
  activeDoctors,
  activeRooms,
  onClose,
  onConfirm,
  onSuccess,
  onNavigateToDashboard,
  initialConflictWarning,
}: ServiceCheckInModalProps) {
  const { facilityName, letterhead } = useClinic();

  // Priority series evaluation
  const isSeniorOrPwd = useMemo(() => isSeniorOrPwdEligible(patient), [patient]);

  // Selected VisitType (purpose of the visit)
  const [selectedVisitType, setSelectedVisitType] = useState<VisitType>(initialVisitType);

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
    activeTickets?: ConflictActiveTicketSummary[];
  } | null>(initialConflictWarning ?? null);

  // Issued Ticket Confirmation State (Post-Queue Dialog)
  const [issuedTicket, setIssuedTicket] = useState<{
    queueNumber: string;
    visitType: VisitType;
    visitLabel: string;
    patientName: string;
  } | null>(null);

  // Reset or initialize state whenever patient or initialVisitType changes
  useEffect(() => {
    if (visible && patient) {
      const eligible = isSeniorOrPwdEligible(patient);
      setIsPrioritySeries(eligible);
      setSelectedVisitType(initialVisitType);
      setConflictWarning(initialConflictWarning ?? null);
      setIssuedTicket(null);
    }
  }, [visible, patient, initialVisitType, initialConflictWarning]);

  // Ticket prefix
  const currentPrefix = useMemo(() => {
    return resolveTicketPrefix(selectedVisitType, isPrioritySeries);
  }, [selectedVisitType, isPrioritySeries]);

  const handleCloseAll = useCallback(() => {
    setConflictWarning(null);
    setIssuedTicket(null);
    onClose();
  }, [onClose]);

  const handlePrintTicket = useCallback(() => {
    if (!issuedTicket || !patient) return;
    const now = new Date();
    const issuedAt = `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    printThermalQueueTicket(
      {
        queueNumber: issuedTicket.queueNumber,
        patientName: issuedTicket.patientName,
        patientCode: patient.patientCode,
        demographics: formatPatientDemographicsLine(patient),
        serviceType: issuedTicket.visitLabel,
        priorityLabel: isPrioritySeries ? 'Senior & PWD Priority' : 'Regular',
        issuedAt,
      },
      letterhead?.header ? letterhead : { header: facilityName || 'CLINIC EZ HEALTHCARE' }
    );
  }, [issuedTicket, patient, isPrioritySeries, letterhead, facilityName]);

  // Submission handler
  const handleConfirm = async (overridePayload?: ServiceCheckInPayload, allowDuplicate = false) => {
    if (!patient || submitting) return;

    const visitConfig =
      VISIT_TYPE_OPTIONS.find((v) => v.visitType === selectedVisitType) ?? VISIT_TYPE_OPTIONS[0];
    const basePayload = overridePayload || {
      patientId: patient.id,
      patientName: patient.fullName,
      priority: (visitConfig.visitType === 'UrgentCareVisit' ? 'Urgent' : 'Routine') as QueuePriority,
      visitType: visitConfig.visitType,
      chiefComplaint: visitConfig.label,
      seriesPrefix: currentPrefix,
    };
    const payload: ServiceCheckInPayload = {
      ...basePayload,
      allowDuplicateActive: allowDuplicate,
    };

    const buildActiveTicketSummaries = (
      fallbackQueueNumber: string,
      fallbackStatus: string,
      fallbackVisitType: string
    ): ConflictActiveTicketSummary[] => {
      if (patient.activeQueueTickets && patient.activeQueueTickets.length > 0) {
        return patient.activeQueueTickets.map((t) => ({
          queueNumber: t.queueNumber,
          status: String(t.status),
          visitType: String(t.visitType || 'RoutineCheckup'),
          chiefComplaint: t.chiefComplaint || undefined,
          doctorName: t.doctorName || undefined,
          checkInTime: t.checkInTime || undefined,
        }));
      }
      return [
        {
          queueNumber: fallbackQueueNumber,
          status: fallbackStatus,
          visitType: fallbackVisitType,
        },
      ];
    };

    // If patient already has an active queue ticket and staff has not confirmed duplicate override, warn staff immediately
    if (!allowDuplicate && (patient.activeQueueTicket || (patient.activeQueueTickets && patient.activeQueueTickets.length > 0))) {
      const tickets = buildActiveTicketSummaries(
        patient.activeQueueTicket || 'Existing Ticket',
        (patient as any).activeQueueStatus || (patient as any).verificationStatus || 'Waiting',
        visitConfig.visitType
      );

      setConflictWarning({
        queueNumber: tickets[0].queueNumber,
        status: tickets[0].status,
        patientName: patient.fullName,
        payload,
        activeTickets: tickets,
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
          activeTickets: buildActiveTicketSummaries(ticketNumber, queueStatus, visitConfig.visitType),
        });
        return;
      }

      if (result) {
        setConflictWarning(null);
        setIssuedTicket({
          queueNumber: result.queueNumber,
          visitType: visitConfig.visitType,
          visitLabel: visitConfig.label,
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
          activeTickets: buildActiveTicketSummaries(ticketNumber, queueStatus, visitConfig.visitType),
        });
      } else {
        notify.error(e?.message || 'Check-in failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible || !patient) return null;

  // 1. Post-Queue Confirmation Dialog
  if (issuedTicket) {
    const issuedVisitMeta = formatVisitTypeMeta(issuedTicket.visitType);
    const postQueueFooter = (
      <View style={styles.postQueueFooter}>
        <Button
          variant="secondary"
          icon="print"
          iconOnly={true}
          accessibilityLabel="Print thermal queue ticket"
          onPress={handlePrintTicket}
          testID="post-queue-print-button"
        />
        <View style={styles.postQueueFooterRight}>
          <Button
            title="Done"
            variant={onNavigateToDashboard ? 'secondary' : 'primary'}
            onPress={handleCloseAll}
            testID="post-queue-done-button"
          />
          {onNavigateToDashboard ? (
            <Button
              title="View on Dashboard"
              variant="primary"
              icon="arrowRight"
              onPress={() => {
                handleCloseAll();
                onNavigateToDashboard();
              }}
              testID="post-queue-dashboard-button"
            />
          ) : null}
        </View>
      </View>
    );

    return (
      <Modal
        visible={visible}
        onClose={handleCloseAll}
        title="Ticket Issued"
        subtitle={issuedTicket.patientName}
        maxWidth={500}
        footer={postQueueFooter}
        testID="post-queue-dialog"
      >
        <View style={styles.postQueueWrap}>
          <View style={styles.postQueueTicketCard}>
            <View style={styles.postQueueSuccessBadge}>
              <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.successText} />
            </View>

            <View style={styles.postQueueNumberGroup}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.postQueueLabel}>
                TICKET NUMBER
              </ThemedText>
              <ThemedText variant="display" color={theme.colors.text} style={styles.postQueueTicketNumber}>
                {issuedTicket.queueNumber}
              </ThemedText>
            </View>

            <View style={styles.postQueueBadgeRow}>
              <Badge
                label={issuedTicket.visitLabel}
                variant="neutral"
                size="md"
                icon={issuedVisitMeta.icon}
                style={styles.postQueueServiceBadge}
              />
              {isPrioritySeries ? (
                <Badge
                  label="Senior & PWD Priority"
                  variant="warning"
                  size="md"
                />
              ) : null}
            </View>

            <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.postQueueHint}>
              Added to today’s queue.
            </ThemedText>
          </View>
        </View>
      </Modal>
    );
  }

  // 2. Active Queue Warning Dialog
  if (conflictWarning) {
    const resolvedTickets: ConflictActiveTicketSummary[] =
      conflictWarning.activeTickets && conflictWarning.activeTickets.length > 0
        ? conflictWarning.activeTickets
        : [
            {
              queueNumber: conflictWarning.queueNumber,
              status: conflictWarning.status,
              visitType: String(conflictWarning.payload.visitType || selectedVisitType),
              chiefComplaint: conflictWarning.payload.chiefComplaint,
            },
          ];

    const pendingServiceMeta = formatVisitTypeMeta(
      String(conflictWarning.payload.visitType || selectedVisitType)
    );
    const pendingSeriesPrefix = (conflictWarning.payload.seriesPrefix || currentPrefix).toUpperCase();
    const isPendingPriority = pendingSeriesPrefix.startsWith('S') && pendingSeriesPrefix.length > 1;

    const conflictFooter = (
      <View style={styles.modalFooter}>
        <Button
          title="Go back"
          variant="secondary"
          icon="arrowLeft"
          onPress={() => setConflictWarning(null)}
          disabled={submitting}
          testID="conflict-go-back-button"
        />
        <Button
          title="Yes, add new ticket"
          variant="primary"
          icon="ticket"
          loading={submitting}
          onPress={() => handleConfirm(conflictWarning.payload, true)}
          testID="conflict-continue-button"
        />
      </View>
    );

    return (
      <Modal
        visible={visible}
        onClose={() => setConflictWarning(null)}
        title="Patient Already in Queue"
        subtitle={conflictWarning.patientName}
        maxWidth={500}
        footer={conflictFooter}
        testID="active-queue-warning-dialog"
      >
        <View style={styles.conflictWrap}>
          {/* 1. Conversational Warning Question Banner */}
          <View style={styles.conflictAlertBanner}>
            <View style={styles.conflictAlertIconWrap}>
              <Icon name="alert" size={theme.sizes.iconMd} color={theme.colors.warningText} />
            </View>
            <View style={styles.conflictAlertTextCol}>
              <ThemedText variant="smallBold" color={theme.colors.warningText}>
                {resolvedTickets.length > 1
                  ? `This patient already has ${resolvedTickets.length} active tickets today.`
                  : 'This patient already has an active ticket today.'}
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.text} style={styles.conflictAlertBody}>
                {`Do you want to continue and add a new ${pendingServiceMeta.label} ticket${
                  isPendingPriority ? ' (Senior & PWD Priority)' : ''
                }?`}
              </ThemedText>
            </View>
          </View>

          {/* 2. Clean Active Queue Ticket Cards */}
          <View style={styles.conflictTicketsSection}>
            <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
              {resolvedTickets.length > 1 ? 'Active tickets' : 'Active ticket'}
            </ThemedText>

            <View style={styles.conflictTicketsList} testID="conflict-tickets-list">
              {resolvedTickets.map((t, idx) => {
                const statusMeta = formatQueueStatusMeta(t.status);
                const visitMeta = formatVisitTypeMeta(t.visitType);
                const subtext = formatTicketSubtext(t, visitMeta.label);

                return (
                  <View
                    key={`${t.queueNumber}-${idx}`}
                    style={styles.conflictTicketCard}
                    testID={`conflict-ticket-card-${t.queueNumber}`}
                  >
                    <View style={styles.conflictTicketBadgeBox}>
                      <Icon name="ticket" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                      <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
                        {t.queueNumber}
                      </ThemedText>
                    </View>

                    <View style={styles.conflictTicketMetaCol}>
                      <ThemedText variant="smallBold" color={theme.colors.text} numberOfLines={1}>
                        {visitMeta.label}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                        {subtext}
                      </ThemedText>
                    </View>

                    <Badge
                      label={statusMeta.label}
                      variant={statusMeta.variant}
                      size="sm"
                      icon={statusMeta.icon}
                    />
                  </View>
                );
              })}
            </View>
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
      subtitle={patient.fullName}
      maxWidth={500}
      footer={modalFooter}
      testID="service-checkin-modal"
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Visit Type (Purpose of Visit) Selector */}
        <View style={styles.formSection}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            What is the purpose of the patient&apos;s visit?
          </ThemedText>
          <View style={styles.serviceCardsGrid}>
            {VISIT_TYPE_OPTIONS.map((vt) => {
              const isSelected = selectedVisitType === vt.visitType;
              return (
                <Pressable
                  key={vt.visitType}
                  accessibilityRole="button"
                  accessibilityLabel={vt.label}
                  testID={`visit-type-tab-${vt.visitType.toLowerCase()}`}
                  onPress={() => setSelectedVisitType(vt.visitType)}
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
                        name={vt.icon}
                        size={theme.sizes.iconMd}
                        color={isSelected ? theme.colors.primaryDark : theme.colors.textMuted}
                      />
                    </View>
                    <View style={styles.serviceCardTextCol}>
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {vt.label}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={2}>
                        {vt.hint}
                      </ThemedText>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 2. Priority Selection */}
        <View style={styles.formSection}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Does this patient need a priority lane?
          </ThemedText>

          <View style={styles.chipsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Regular"
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
                Regular
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Senior & PWD Priority"
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
                Senior & PWD priority selected automatically.
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
    gap: theme.spacing.lg,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
  },
  formSection: {
    gap: theme.spacing.sm,
  },
  serviceCardsGrid: {
    flexDirection: 'column',
    width: '100%',
    gap: theme.spacing.sm,
  },
  serviceCard: {
    width: '100%',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
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
    gap: theme.spacing.md,
  },
  serviceCardTextCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  serviceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
    marginTop: theme.spacing.xs,
  },
  postQueueWrap: {
    width: '100%',
    alignItems: 'center',
  },
  postQueueTicketCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: theme.spacing['2xl'],
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  postQueueSuccessBadge: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postQueueNumberGroup: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  postQueueLabel: {
    letterSpacing: 1,
    textAlign: 'center',
  },
  postQueueTicketNumber: {
    letterSpacing: 1,
    textAlign: 'center',
  },
  postQueueBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  postQueueServiceBadge: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
  },
  postQueueHint: {
    textAlign: 'center',
  },
  postQueueFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    width: '100%',
  },
  postQueueFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginLeft: 'auto',
  },
  conflictWrap: {
    gap: theme.spacing.lg,
  },
  conflictAlertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
  },
  conflictAlertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  conflictAlertTextCol: {
    flex: 1,
    gap: 2,
  },
  conflictAlertBody: {
    lineHeight: 19,
  },
  conflictTicketsSection: {
    gap: theme.spacing.sm,
  },
  conflictTicketsList: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  conflictTicketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  conflictTicketBadgeBox: {
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
  conflictTicketMetaCol: {
    flex: 1,
    gap: 2,
  },
});
