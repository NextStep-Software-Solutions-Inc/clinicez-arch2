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
import { useStaff } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import { notify } from '../../utils/feedback';
import { printThermalQueueTicket } from '../../utils/printHelper';
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
  initialService?: ClinicalServiceType;
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
 * Maps VisitType enum strings or service names to human-readable clinical labels and icons.
 */
export function formatVisitTypeMeta(visitType?: string | null): {
  label: string;
  icon: IconName;
} {
  const normalized = String(visitType || 'Consultation').trim();
  switch (normalized) {
    case 'Consultation':
    case 'Doctor Consultation':
      return { label: 'Doctor Consultation', icon: 'stethoscope' };
    case 'FollowUp':
      return { label: 'Follow-Up Consultation', icon: 'stethoscope' };
    case 'UrgentCare':
    case 'Emergency':
      return { label: 'Urgent Consultation', icon: 'emergency' };
    case 'VitalsCheckOnly':
    case 'Vitals Check':
      return { label: 'Vitals Check', icon: 'heartPulse' };
    case 'StandaloneProcedure':
    case 'ProcedureOnly':
    case 'Clinical Procedure':
      return { label: 'Clinical Procedure', icon: 'syringe' };
    case 'AdministrativeDocument':
    case 'Administrative & Clearance':
      return { label: 'Administrative & Clearance', icon: 'file' };
    default: {
      const humanized = normalized.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
      return { label: humanized || 'Clinical Visit', icon: 'clipboard' };
    }
  }
}

/**
 * Builds non-redundant secondary metadata for an active ticket card
 * (chief complaint if distinct from generic service label, assigned clinician, check-in time).
 */
export function formatTicketSubtext(
  ticket: {
    visitType?: string | null;
    chiefComplaint?: string | null;
    doctorName?: string | null;
    checkInTime?: string | null;
    status?: string | null;
  },
  resolvedServiceLabel: string
): string {
  const parts: string[] = [];
  const rawComplaint = (ticket.chiefComplaint || '').trim();
  const genericLabels = new Set([
    resolvedServiceLabel.toLowerCase(),
    String(ticket.visitType || '').trim().toLowerCase(),
    'general consultation',
    'doctor consultation',
    'vitals check',
    'clinical procedure',
    'administrative & clearance',
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

  if (ticket.status === 'InConsultation') return 'Currently with clinician';
  if (ticket.status === 'InTriage') return 'Currently at triage desk';
  if (ticket.status === 'Called') return 'Called to consultation room';
  return 'Active in today’s queue';
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
    activeTickets?: ConflictActiveTicketSummary[];
  } | null>(initialConflictWarning ?? null);

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
      setConflictWarning(initialConflictWarning ?? null);
      setIssuedTicket(null);
    }
  }, [visible, patient, initialService, initialConflictWarning]);

  // Ticket prefix
  const currentPrefix = useMemo(() => {
    return resolveTicketPrefix(selectedService, isPrioritySeries);
  }, [selectedService, isPrioritySeries]);

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
        serviceType: issuedTicket.serviceType,
        priorityLabel: isPrioritySeries ? 'Senior & PWD Priority' : 'Regular Queue Series',
        issuedAt,
      },
      letterhead?.header ? letterhead : { header: facilityName || 'CLINIC EZ HEALTHCARE' }
    );
  }, [issuedTicket, patient, isPrioritySeries, letterhead, facilityName]);

  // Submission handler
  const handleConfirm = async (overridePayload?: ServiceCheckInPayload, allowDuplicate = false) => {
    if (!patient || submitting) return;

    const serviceConfig = CLINICAL_SERVICES.find((s) => s.type === selectedService)!;
    const basePayload = overridePayload || {
      patientId: patient.id,
      patientName: patient.fullName,
      priority: 'Routine' as QueuePriority,
      visitType: serviceConfig.visitType,
      chiefComplaint: serviceConfig.label,
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
          visitType: String(t.visitType || 'Consultation'),
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
        serviceConfig.label
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
          activeTickets: buildActiveTicketSummaries(ticketNumber, queueStatus, serviceConfig.label),
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
          activeTickets: buildActiveTicketSummaries(ticketNumber, queueStatus, serviceConfig.label),
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
            <Button
              variant="outline"
              size="lg"
              icon="print"
              iconOnly={true}
              accessibilityLabel="Print thermal queue ticket"
              onPress={handlePrintTicket}
              testID="post-queue-print-button"
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
    const resolvedTickets: ConflictActiveTicketSummary[] =
      conflictWarning.activeTickets && conflictWarning.activeTickets.length > 0
        ? conflictWarning.activeTickets
        : [
            {
              queueNumber: conflictWarning.queueNumber,
              status: conflictWarning.status,
              visitType: String(conflictWarning.payload.visitType || selectedService),
              chiefComplaint: conflictWarning.payload.chiefComplaint,
            },
          ];

    const pendingServiceMeta = formatVisitTypeMeta(
      String(conflictWarning.payload.visitType || selectedService)
    );
    const pendingSeriesPrefix = (conflictWarning.payload.seriesPrefix || currentPrefix).toUpperCase();
    const isPendingPriority = pendingSeriesPrefix.startsWith('S') && pendingSeriesPrefix.length > 1;

    const conflictSubtitle =
      resolvedTickets.length > 1
        ? `${conflictWarning.patientName} already has ${resolvedTickets.length} active visits today`
        : `${conflictWarning.patientName} already has an active visit today`;

    const conflictFooter = (
      <View style={styles.modalFooter}>
        <Button
          title="Go back"
          variant="outline"
          icon="arrowLeft"
          onPress={() => setConflictWarning(null)}
          disabled={submitting}
          testID="conflict-go-back-button"
        />
        <Button
          title="Issue additional ticket"
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
        subtitle={conflictSubtitle}
        maxWidth={520}
        footer={conflictFooter}
        testID="active-queue-warning-dialog"
      >
        <View style={styles.conflictWrap}>
          {/* 1. Slim Warning Callout Banner */}
          <View style={styles.conflictAlertBanner}>
            <View style={styles.conflictAlertIconWrap}>
              <Icon name="alert" size={theme.sizes.iconMd} color={theme.colors.warningText} />
            </View>
            <View style={styles.conflictAlertTextCol}>
              <ThemedText variant="smallBold" color={theme.colors.warningText}>
                {resolvedTickets.length > 1
                  ? `${resolvedTickets.length} Active Queue Tickets Found`
                  : 'Active Queue Ticket Found'}
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.text} style={styles.conflictAlertBody}>
                Most visits only require a single queue ticket. Review today’s active queue below before issuing another ticket.
              </ThemedText>
            </View>
          </View>

          {/* 2. Clean Active Queue Ticket Cards */}
          <View style={styles.conflictTicketsSection}>
            <View style={styles.sectionHeaderRow}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                TODAY’S ACTIVE QUEUE
              </ThemedText>
              <Badge label={`${resolvedTickets.length} active`} variant="neutral" size="xs" />
            </View>

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

          {/* 3. Pending New Ticket Request Summary */}
          <View style={styles.conflictNewRequestCard} testID="conflict-new-request-summary">
            <View style={styles.conflictNewRequestLeft}>
              <View style={styles.conflictNewRequestIconWrap}>
                <Icon name="plus" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
              </View>
              <View style={styles.conflictTicketMetaCol}>
                <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                  NEW TICKET TO ISSUE
                </ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text} numberOfLines={1}>
                  {pendingServiceMeta.label}
                </ThemedText>
              </View>
            </View>
            <Badge
              label={isPendingPriority ? `Priority (${pendingSeriesPrefix})` : `Regular (${pendingSeriesPrefix})`}
              variant="outline"
              size="sm"
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
  conflictNewRequestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  conflictNewRequestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  conflictNewRequestIconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
