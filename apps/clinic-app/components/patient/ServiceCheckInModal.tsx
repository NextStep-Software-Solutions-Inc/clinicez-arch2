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
  Input,
  type IconName,
} from '../ui';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type ClinicPatient,
  type StaffMember,
  type QueuePriority,
  type VisitType,
} from '../../services/clinicService';
import { useStaff, formatStaffName } from '../../context/StaffContext';
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
}

export interface ServiceCheckInModalProps {
  visible: boolean;
  patient: ClinicPatient | null;
  initialService?: ClinicalServiceType;
  activeDoctors?: StaffMember[];
  activeRooms?: Array<{ id: string; name: string; isActive?: boolean }>;
  onClose: () => void;
  onConfirm?: (payload: ServiceCheckInPayload) => Promise<void> | void;
  onSuccess?: (ticketNumber?: string) => void;
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

const CONSULTATION_COMPLAINT_PRESETS = [
  'General checkup',
  'Fever / Cough',
  'Hypertension follow-up',
  'Prescription refill',
  'Diagnostic order slip',
];

const VITALS_PURPOSE_PRESETS = [
  'Pre-employment / Enrollment',
  'Hypertension / BP Monitoring',
  'Blood Sugar Check',
  'General Walk-in',
];

const PROCEDURE_TYPE_PRESETS = [
  'Wound dressing / Cleaning',
  'Suture removal',
  'IM/IV Injection',
  'Tetanus toxoid',
  'Vaccination',
  'Nebulization',
  'Ear irrigation',
  'Blood glucose fingerstick',
];

const DOCUMENT_TYPE_PRESETS = [
  'Medical Certificate',
  'Fit-to-Work / School Clearance',
  'Health Certificate',
  'Medical Records Release',
  'PhilHealth Annex Form',
];

const REQUESTING_ENTITY_PRESETS = [
  'Employer',
  'School',
  'Sports League',
  'Travel',
  'LGU',
];

export default function ServiceCheckInModal({
  visible,
  patient,
  initialService = 'Doctor Consultation',
  activeDoctors: doctorsProp,
  activeRooms: roomsProp,
  onClose,
  onConfirm,
  onSuccess,
  style,
}: ServiceCheckInModalProps) {
  const { staff } = useStaff();

  // Active clinic doctors pool
  const activeDoctors = useMemo(() => {
    if (doctorsProp && doctorsProp.length > 0) return doctorsProp;
    return (staff ?? []).filter((s) => s.role === 'Doctor' && s.isActive !== false);
  }, [doctorsProp, staff]);

  // Active rooms pool
  const activeRooms = useMemo(() => {
    if (roomsProp && roomsProp.length > 0) return roomsProp;
    return [];
  }, [roomsProp]);

  // Priority series evaluation
  const isSeniorOrPwd = useMemo(() => isSeniorOrPwdEligible(patient), [patient]);

  // Selected Service
  const [selectedService, setSelectedService] = useState<ClinicalServiceType>(initialService);

  // Ticket Series Preference: defaults to Priority series if Senior/PWD eligible
  const [isPrioritySeries, setIsPrioritySeries] = useState<boolean>(isSeniorOrPwd);

  // Form State: Priority
  const [priority, setPriority] = useState<QueuePriority>('Routine');

  // Form State: Consultation
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [complaint, setComplaint] = useState<string>('General checkup');

  // Form State: Vitals
  const [vitalsStation, setVitalsStation] = useState<string>('Triage Station A');
  const [vitalsPurpose, setVitalsPurpose] = useState<string>('General Walk-in');
  const [vitalsNotes, setVitalsNotes] = useState<string>('');

  // Form State: Procedure
  const [procedureName, setProcedureName] = useState<string>('Wound dressing / Cleaning');
  const [procedureBay, setProcedureBay] = useState<string>('Treatment Bay');
  const [orderingDoctorId, setOrderingDoctorId] = useState<string>('');
  const [procedureNotes, setProcedureNotes] = useState<string>('');

  // Form State: Administrative
  const [docType, setDocType] = useState<string>('Medical Certificate');
  const [requestingEntity, setRequestingEntity] = useState<string>('Employer');
  const [adminNotes, setAdminNotes] = useState<string>('');

  // Loading State
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Reset or initialize state whenever patient or initialService changes
  useEffect(() => {
    if (visible && patient) {
      const eligible = isSeniorOrPwdEligible(patient);
      setIsPrioritySeries(eligible);
      setSelectedService(initialService);
      setPriority(
        patient.alerts?.toLowerCase().includes('fall') || patient.alerts?.toLowerCase().includes('chest')
          ? 'Urgent'
          : 'Routine'
      );

      // Default doctor if on duty
      const defaultDoc = activeDoctors[0];
      if (defaultDoc) {
        setSelectedDoctorId(defaultDoc.id);
        const docRooms = defaultDoc.assignedRoomIds ?? (defaultDoc.assignedRoomId ? [defaultDoc.assignedRoomId] : []);
        setSelectedRoomId(docRooms[0] ?? '');
      } else {
        setSelectedDoctorId('');
        setSelectedRoomId('');
      }

      setComplaint(
        patient.chronicConditions ? `Follow-up: ${patient.chronicConditions}` : 'General checkup'
      );
      setVitalsStation(activeRooms.find((r) => r.name.toLowerCase().includes('triage'))?.name || 'Triage Station A');
      setVitalsPurpose('General Walk-in');
      setVitalsNotes('');

      setProcedureName('Wound dressing / Cleaning');
      setProcedureBay(activeRooms.find((r) => r.name.toLowerCase().includes('procedure'))?.name || 'Treatment Bay');
      setOrderingDoctorId('');
      setProcedureNotes('');

      setDocType('Medical Certificate');
      setRequestingEntity('Employer');
      setAdminNotes('');
    }
  }, [visible, patient, initialService, activeDoctors, activeRooms]);

  // Handle doctor selection & room auto-populate
  const handleSelectDoctor = useCallback(
    (docId: string) => {
      setSelectedDoctorId(docId);
      if (!docId) return;
      const doc = activeDoctors.find((d) => d.id === docId);
      const docRooms = doc?.assignedRoomIds ?? (doc?.assignedRoomId ? [doc.assignedRoomId] : []);
      if (docRooms.length > 0) {
        setSelectedRoomId(docRooms[0]);
      }
    },
    [activeDoctors]
  );

  // Ticket prefix preview
  const currentPrefix = useMemo(() => {
    return resolveTicketPrefix(selectedService, isPrioritySeries);
  }, [selectedService, isPrioritySeries]);

  const ticketPreview = useMemo(() => {
    return formatQueueTicketNumber(currentPrefix, 1);
  }, [currentPrefix]);

  // Submission handler
  const handleConfirm = async () => {
    if (!patient || submitting) return;
    setSubmitting(true);

    try {
      const serviceConfig = CLINICAL_SERVICES.find((s) => s.type === selectedService)!;
      let constructedComplaint = '';
      let chosenDoctorId: string | undefined = undefined;
      let chosenDoctorName: string | undefined = undefined;
      let chosenRoomId: string | undefined = undefined;
      let chosenRoomOrStation: string | undefined = undefined;

      if (selectedService === 'Doctor Consultation') {
        constructedComplaint = complaint.trim() || 'General consultation';
        const doc = activeDoctors.find((d) => d.id === selectedDoctorId);
        chosenDoctorId = doc?.id;
        chosenDoctorName = doc ? formatStaffName(doc) : undefined;
        const room = activeRooms.find((r) => r.id === selectedRoomId);
        chosenRoomId = room?.id;
        chosenRoomOrStation = room?.name;
      } else if (selectedService === 'Vitals Check') {
        constructedComplaint = vitalsNotes.trim()
          ? `Vitals check: ${vitalsPurpose} (${vitalsNotes.trim()})`
          : `Vitals check: ${vitalsPurpose}`;
        chosenRoomOrStation = vitalsStation;
      } else if (selectedService === 'Clinical Procedure') {
        const doc = activeDoctors.find((d) => d.id === orderingDoctorId);
        const orderDocStr = doc ? `Ordered by ${formatStaffName(doc)}` : '';
        const notesStr = [procedureNotes.trim(), orderDocStr].filter(Boolean).join(' • ');
        constructedComplaint = notesStr
          ? `Procedure: ${procedureName} (${notesStr})`
          : `Procedure: ${procedureName}`;
        chosenRoomOrStation = procedureBay;
        chosenDoctorId = doc?.id;
        chosenDoctorName = doc ? formatStaffName(doc) : undefined;
      } else if (selectedService === 'Administrative & Clearance') {
        constructedComplaint = adminNotes.trim()
          ? `Administrative: ${docType} for ${requestingEntity} (${adminNotes.trim()})`
          : `Administrative: ${docType} for ${requestingEntity}`;
        chosenRoomOrStation = 'Administrative Desk / Reception';
      }

      const payload: ServiceCheckInPayload = {
        patientId: patient.id,
        patientName: patient.fullName,
        doctorId: chosenDoctorId,
        doctorName: chosenDoctorName,
        roomId: chosenRoomId,
        roomOrStation: chosenRoomOrStation,
        priority,
        visitType: serviceConfig.visitType,
        chiefComplaint: constructedComplaint,
        seriesPrefix: currentPrefix,
      };

      if (onConfirm) {
        await onConfirm(payload);
      } else {
        const [res, err] = await clinicService.checkInPatient(payload);
        if (err) {
          notify.error(err.message || 'Could not queue the patient.');
          return;
        }
        notify.success(`Ticket ${res?.queueNumber || currentPrefix} issued for ${patient.fullName}`);
        onSuccess?.(res?.queueNumber);
        onClose();
      }
    } catch (e: any) {
      notify.error(e?.message || 'Check-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible || !patient) return null;

  const initials = getPatientInitials(patient);
  const demographicsLine = formatPatientDemographicsLine(patient);
  const hasAllergies = hasKnownAllergies(patient.allergies);
  const isStat = hasStatAllergy(patient.allergies);

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
        title="Confirm Check-In (Issue Ticket)"
        variant="primary"
        icon="ticket"
        loading={submitting}
        onPress={handleConfirm}
        testID="confirm-check-in-button"
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Queue Patient"
      subtitle="Issue waiting room ticket and select clinical service"
      maxWidth={720}
      testID="service-check-in-modal"
      footer={modalFooter}
    >
      <ScrollView
        style={styles.modalScroll}
        contentContainerStyle={styles.modalScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Patient Identity Banner */}
        <View style={styles.patientBannerCard} testID="patient-identity-banner">
          <View style={styles.avatarCircle}>
            <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
              {initials}
            </ThemedText>
          </View>
          <View style={styles.bannerInfo}>
            <View style={styles.bannerNameRow}>
              <ThemedText variant="h3" color={theme.colors.text}>
                {patient.fullName}
              </ThemedText>
              <Badge label={patient.patientCode} variant="neutral" size="sm" />
              {patient.clinicEzId ? (
                <Badge label={patient.clinicEzId} variant="primary" size="sm" />
              ) : null}
              {patient.seniorCitizenId ? (
                <Badge label={`Senior ${patient.seniorCitizenId}`} variant="warning" size="sm" />
              ) : null}
              {patient.pwdId ? (
                <Badge label={`PWD ${patient.pwdId}`} variant="purple" size="sm" />
              ) : null}
            </View>

            <ThemedText variant="small" color={theme.colors.textSecondary}>
              {demographicsLine || 'Age and demographics recorded'}
            </ThemedText>

            {/* Clinical Alert & Safety Strip */}
            {hasAllergies || patient.alerts ? (
              <View style={styles.alertsContainer}>
                {hasAllergies ? (
                  <View style={[styles.compactNoticeStrip, styles.allergyStrip]}>
                    <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                    {isStat ? <Badge label="STAT" variant="emergency" size="sm" /> : null}
                    <ThemedText variant="captionBold" color={theme.colors.emergencyText} numberOfLines={1}>
                      Allergies: {patient.allergies}
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
                Preview: {ticketPreview}
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
                Regular Queue Series ({resolveTicketPrefix(selectedService, false)}-001)
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
                Senior & PWD Priority ({resolveTicketPrefix(selectedService, true)}-001)
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

        {/* 3. Clinical Urgency / Priority */}
        <View style={styles.formSection}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
            VISIT PRIORITY
          </ThemedText>
          <View style={styles.chipsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Routine Priority"
              onPress={() => setPriority('Routine')}
              style={[
                styles.chip,
                priority === 'Routine' ? styles.chipSelected : styles.chipUnselected,
              ]}
            >
              <ThemedText
                variant="smallBold"
                color={priority === 'Routine' ? theme.colors.primaryDark : theme.colors.text}
              >
                Routine
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Urgent Priority"
              onPress={() => setPriority('Urgent')}
              style={[
                styles.chip,
                priority === 'Urgent' ? styles.chipUrgentSelected : styles.chipUnselected,
              ]}
            >
              <ThemedText
                variant="smallBold"
                color={priority === 'Urgent' ? theme.colors.warningText : theme.colors.text}
              >
                Urgent
              </ThemedText>
            </Pressable>

            {selectedService === 'Doctor Consultation' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Emergency Priority"
                onPress={() => setPriority('Emergency')}
                style={[
                  styles.chip,
                  priority === 'Emergency' ? styles.chipEmergencySelected : styles.chipUnselected,
                ]}
              >
                <ThemedText
                  variant="smallBold"
                  color={priority === 'Emergency' ? theme.colors.emergencyText : theme.colors.text}
                >
                  Emergency
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* 4. Service-Specific View Contents */}

        {/* A. Doctor Consultation View */}
        {selectedService === 'Doctor Consultation' ? (
          <View style={styles.tailoredViewContainer}>
            {/* Attending Physician Picker */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                ATTENDING PHYSICIAN
              </ThemedText>
              <View style={styles.chipsRow} testID="doctor-picker">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Any Available Doctor"
                  onPress={() => handleSelectDoctor('')}
                  style={[
                    styles.chip,
                    !selectedDoctorId ? styles.chipSelected : styles.chipUnselected,
                  ]}
                >
                  <ThemedText
                    variant="smallBold"
                    color={!selectedDoctorId ? theme.colors.primaryDark : theme.colors.text}
                  >
                    Any Available Doctor
                  </ThemedText>
                </Pressable>

                {activeDoctors.map((doc) => {
                  const isSelected = selectedDoctorId === doc.id;
                  return (
                    <Pressable
                      key={doc.id}
                      accessibilityRole="button"
                      accessibilityLabel={formatStaffName(doc)}
                      onPress={() => handleSelectDoctor(doc.id)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {formatStaffName(doc)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Consultation Room */}
            {activeRooms.length > 0 ? (
              <View style={styles.formSection}>
                <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                  CONSULTATION ROOM
                </ThemedText>
                <View style={styles.chipsRow} testID="room-picker">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Auto-assign Room"
                    onPress={() => setSelectedRoomId('')}
                    style={[
                      styles.chip,
                      !selectedRoomId ? styles.chipSelected : styles.chipUnselected,
                    ]}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={!selectedRoomId ? theme.colors.primaryDark : theme.colors.text}
                    >
                      Auto-assign Room
                    </ThemedText>
                  </Pressable>
                  {activeRooms.map((rm) => {
                    const isSelected = selectedRoomId === rm.id;
                    return (
                      <Pressable
                        key={rm.id}
                        accessibilityRole="button"
                        accessibilityLabel={rm.name}
                        onPress={() => setSelectedRoomId(rm.id)}
                        style={[
                          styles.chip,
                          isSelected ? styles.chipSelected : styles.chipUnselected,
                        ]}
                      >
                        <ThemedText
                          variant="smallBold"
                          color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                        >
                          {rm.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Chief Complaint */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                CHIEF COMPLAINT & SYMPTOMS
              </ThemedText>
              <View style={styles.chipsRow}>
                {CONSULTATION_COMPLAINT_PRESETS.map((preset) => {
                  const isSelected = complaint === preset;
                  return (
                    <Pressable
                      key={preset}
                      accessibilityRole="button"
                      accessibilityLabel={preset}
                      onPress={() => setComplaint(preset)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {preset}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <Input
                label="Custom Complaint / Clinical Notes"
                value={complaint}
                onChangeText={setComplaint}
                placeholder="Describe primary symptom or reason for visit..."
                testID="complaint-input"
              />
            </View>
          </View>
        ) : null}

        {/* B. Vitals Check Intent View (Nursing Care / No SOAP) */}
        {selectedService === 'Vitals Check' ? (
          <View style={styles.tailoredViewContainer}>
            {/* Triage Station */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                TRIAGE STATION / NURSING BAY
              </ThemedText>
              <View style={styles.chipsRow}>
                {['Triage Station A', 'Triage Station B', 'Nursing Bay 1', 'Main Reception Triage'].map((st) => {
                  const isSelected = vitalsStation === st;
                  return (
                    <Pressable
                      key={st}
                      accessibilityRole="button"
                      accessibilityLabel={st}
                      onPress={() => setVitalsStation(st)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {st}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Vitals Purpose Presets */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                VITALS MONITORING PURPOSE
              </ThemedText>
              <View style={styles.chipsRow}>
                {VITALS_PURPOSE_PRESETS.map((p) => {
                  const isSelected = vitalsPurpose === p;
                  return (
                    <Pressable
                      key={p}
                      accessibilityRole="button"
                      accessibilityLabel={p}
                      onPress={() => setVitalsPurpose(p)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {p}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <Input
                label="Preliminary Triage Remarks"
                value={vitalsNotes}
                onChangeText={setVitalsNotes}
                placeholder="Optional notes for nursing station (e.g. routine BP check, pre-employment)..."
                testID="vitals-notes-input"
              />
            </View>
          </View>
        ) : null}

        {/* C. Clinical Procedure Intent View (Nursing Care / No SOAP) */}
        {selectedService === 'Clinical Procedure' ? (
          <View style={styles.tailoredViewContainer}>
            {/* Procedure Type Presets */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                PROCEDURE TYPE
              </ThemedText>
              <View style={styles.chipsRow}>
                {PROCEDURE_TYPE_PRESETS.map((proc) => {
                  const isSelected = procedureName === proc;
                  return (
                    <Pressable
                      key={proc}
                      accessibilityRole="button"
                      accessibilityLabel={proc}
                      onPress={() => setProcedureName(proc)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {proc}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <Input
                label="Procedure Name"
                value={procedureName}
                onChangeText={setProcedureName}
                placeholder="Specify clinical procedure..."
                testID="procedure-name-input"
              />
            </View>

            {/* Treatment Bay / Room */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                TREATMENT BAY / ROOM
              </ThemedText>
              <View style={styles.chipsRow}>
                {['Treatment Bay 1', 'Minor Procedure Room', 'Injection Station', 'Nebulization Bay'].map((b) => {
                  const isSelected = procedureBay === b;
                  return (
                    <Pressable
                      key={b}
                      accessibilityRole="button"
                      accessibilityLabel={b}
                      onPress={() => setProcedureBay(b)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {b}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Ordering Doctor (Optional - separated from clinical notes) */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                ORDERING DOCTOR (OPTIONAL)
              </ThemedText>
              <View style={styles.chipsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="No ordering doctor / Walk-in"
                  onPress={() => setOrderingDoctorId('')}
                  style={[
                    styles.chip,
                    !orderingDoctorId ? styles.chipSelected : styles.chipUnselected,
                  ]}
                >
                  <ThemedText
                    variant="smallBold"
                    color={!orderingDoctorId ? theme.colors.primaryDark : theme.colors.text}
                  >
                    No Ordering Doctor (Walk-in)
                  </ThemedText>
                </Pressable>
                {activeDoctors.map((doc) => {
                  const isSelected = orderingDoctorId === doc.id;
                  return (
                    <Pressable
                      key={doc.id}
                      accessibilityRole="button"
                      accessibilityLabel={formatStaffName(doc)}
                      onPress={() => setOrderingDoctorId(doc.id)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {formatStaffName(doc)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Target Site & Clinical Notes */}
            <View style={styles.formSection}>
              <Input
                label="Target Site & Clinical Notes"
                value={procedureNotes}
                onChangeText={setProcedureNotes}
                placeholder="e.g. Left arm laceration dressing change, 0.5ml IM right deltoid..."
                testID="procedure-notes-input"
              />
            </View>
          </View>
        ) : null}

        {/* D. Administrative & Clearance Intent View */}
        {selectedService === 'Administrative & Clearance' ? (
          <View style={styles.tailoredViewContainer}>
            {/* Document Type */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                DOCUMENT / CLEARANCE TYPE
              </ThemedText>
              <View style={styles.chipsRow}>
                {DOCUMENT_TYPE_PRESETS.map((d) => {
                  const isSelected = docType === d;
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="button"
                      accessibilityLabel={d}
                      onPress={() => setDocType(d)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {d}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Requesting Entity */}
            <View style={styles.formSection}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionHeaderLabel}>
                REQUESTING ENTITY / REASON
              </ThemedText>
              <View style={styles.chipsRow}>
                {REQUESTING_ENTITY_PRESETS.map((e) => {
                  const isSelected = requestingEntity === e;
                  return (
                    <Pressable
                      key={e}
                      accessibilityRole="button"
                      accessibilityLabel={e}
                      onPress={() => setRequestingEntity(e)}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {e}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <Input
                label="Requesting Entity / Details"
                value={requestingEntity}
                onChangeText={setRequestingEntity}
                placeholder="e.g. ABC Corporation, DepEd, Sports League..."
                testID="requesting-entity-input"
              />
            </View>

            {/* Additional Remarks */}
            <View style={styles.formSection}>
              <Input
                label="Administrative Remarks / Notes"
                value={adminNotes}
                onChangeText={setAdminNotes}
                placeholder="Purpose or additional release notes..."
                testID="admin-notes-input"
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScroll: {
    maxHeight: 560,
  },
  modalScrollContent: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  patientBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.routineBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.routineBorder,
  },
  bannerInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  bannerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  alertsContainer: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  compactNoticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  allergyStrip: {
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
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.routineBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.routineBorder,
  },
  serviceCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  serviceCard: {
    flex: 1,
    minWidth: 150,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.xs,
  },
  serviceCardSelected: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.primary,
  },
  serviceCardUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  serviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  serviceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceIconWrapSelected: {
    backgroundColor: theme.colors.primary,
  },
  serviceIconWrapUnselected: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
  },
  chipUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.primary,
  },
  chipUrgentSelected: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  chipEmergencySelected: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  priorityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.routineBg,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.routineBorder,
  },
  tailoredViewContainer: {
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
});
