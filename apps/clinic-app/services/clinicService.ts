import axios, { type AxiosRequestConfig } from 'axios';
import { clinicApiClient, clinicApiUrl } from './apiClient';
import { SyncStatus, ApiError, publicRoutes, type SearchResponseDto, type EhrOptionDescriptor } from '@shared/safe';
import { getSetting, getPortalBaseUrl } from './runtimeConfig';

export type QueuePriority = 'Routine' | 'Urgent' | 'Emergency';
export type QueueStatus =
  | 'Waiting'
  | 'Triaged'
  | 'InConsultation'
  | 'Completed'
  | 'Cancelled'
  | 'NoShow'
  | 'PendingProcedure'
  | 'ReEvaluation'
  | 'OnHold'
  | 'DischargedNonDoctor'
  | 'Diverted';

export type VisitType =
  | 'RoutineCheckup'
  | 'AcuteIllnessConsultation'
  | 'ChronicDiseaseFollowUp'
  | 'PreventiveHealthAssessment'
  | 'UrgentCareVisit';

export function isPhysicianConsultationVisitType(visitType?: string | null): boolean {
  switch ((visitType || '').trim()) {
    case 'RoutineCheckup':
    case 'AcuteIllnessConsultation':
    case 'ChronicDiseaseFollowUp':
    case 'UrgentCareVisit':
    case 'Consultation':
      return true;
    default:
      return false;
  }
}

export function isNurseAssessmentVisitType(visitType?: string | null): boolean {
  const normalized = (visitType || '').trim();
  return normalized === 'PreventiveHealthAssessment' || normalized === 'VitalsCheckOnly';
}
export type QueueView =
  | 'All'
  | 'MyRoom'
  | 'WaitingForDoctor'
  | 'Triage'
  | 'PendingProcedure'
  | 'Completed';
export type AppointmentStatus = 'Pending' | 'Confirmed' | 'CheckedIn' | 'InConsultation' | 'Completed' | 'Cancelled';
export type StaffRole = 'Doctor' | 'Nurse' | 'Receptionist' | 'Cashier' | 'Admin';
export type InvoiceStatus = 'Draft' | 'Paid' | 'PartiallyPaid' | 'Voided' | 'Refunded';
export type PaymentMethod = 'Cash' | 'GCash' | 'Maya' | 'CreditCard' | 'DebitCard' | 'PhilHealthKonsulta' | 'HmoInsurance';
export type DiscountType = 'None' | 'SeniorCitizen' | 'Pwd' | 'PhilHealthKonsulta' | 'Custom';
export type ProcedureStatus = 'Ordered' | 'InProgress' | 'Completed' | 'Cancelled';
export type LabOrderStatus = 'Draft' | 'Ordered' | 'SpecimenCollected' | 'InTesting' | 'SentToLab' | 'ResultsReceived' | 'Completed' | 'CompletedWithExternalReport' | 'Cancelled';

export type ClinicRoomType = 'Consultation' | 'Triage' | 'Treatment';

export interface ClinicRoom {
  id: string;
  tenantId: string;
  clinicId: string;
  name: string;
  code?: string | null;
  type: ClinicRoomType;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  assignedStaffCount: number;
  assignedStaffIds?: string[];
  assignedStaffNames?: string[];
  createdAt: string;
}

export interface ClinicRole {
  id: string;
  tenantId: string;
  clinicId: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  staffCount: number;
  createdAt: string;
}

export type SignatureMode = 'ESignatureSpecimen' | 'DigitalSealOnly' | 'WetSignature';

export type StaffAccountStatus = 'Invited' | 'Active' | 'Suspended' | 'Revoked';

export interface StaffMember {
  id: string;
  tenantId: string;
  clinicId: string;
  clinicRoleId?: string;
  roleName?: string;
  assignedRoomIds?: string[];
  assignedRoomNames?: string[];
  assignedRoomId?: string | null;
  assignedRoomName?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  role: StaffRole;
  email?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  ptrNumber?: string;
  s2LicenseNumber?: string;
  philHealthPan?: string;
  specialty?: string;
  signatureSpecimen?: string | null;
  defaultSignatureMode?: SignatureMode;
  isActive: boolean;
  status?: StaffAccountStatus;
  invitationToken?: string | null;
  invitationExpiresAt?: string | null;
  inviteAcceptedAt?: string | null;
  inviteUrl?: string | null;
  isExpired?: boolean;
  createdAt: string;
  hasCredentials?: boolean;
  mustChangePassword?: boolean;
  temporaryPassword?: string | null;
  preferencesJson?: string | null;
}

export interface CreateStaffPayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  role: StaffRole;
  clinicRoleId?: string;
  assignedRoomIds?: string[];
  assignedRoomId?: string | null;
  email?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  ptrNumber?: string;
  s2LicenseNumber?: string;
  philHealthPan?: string;
  specialty?: string;
  signatureSpecimen?: string | null;
  defaultSignatureMode?: SignatureMode;
  initialPassword?: string;
  sendInviteEmail?: boolean;
}

export interface UpdateStaffPayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  role: StaffRole;
  clinicRoleId?: string;
  assignedRoomIds?: string[];
  assignedRoomId?: string | null;
  clearAssignedRoom?: boolean;
  email?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  ptrNumber?: string;
  s2LicenseNumber?: string;
  philHealthPan?: string;
  specialty?: string;
  signatureSpecimen?: string | null;
  defaultSignatureMode?: SignatureMode;
  isActive?: boolean;
}

export interface UpdateMyProfilePayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  ptrNumber?: string;
  s2LicenseNumber?: string;
  philHealthPan?: string;
  specialty?: string;
  signatureSpecimen?: string | null;
  defaultSignatureMode?: SignatureMode;
  preferencesJson?: string | null;
}

export interface ResetStaffPasswordResult {
  staffId: string;
  staffName: string;
  email: string;
  temporaryPassword: string;
  message: string;
  resetToken?: string | null;
  resetUrl?: string | null;
  emailSent?: boolean;
}

export interface FacilityLimits {
  maxStaff: number;
  maxDailyEncounters: number;
  maxActiveBeds: number;
  maxStorageMb: number;
  maxAnalyzers: number;
  isOfflineCapable: boolean;
  canDispenseRestrictedDrugs: boolean;
}

export interface FacilityLicenseStatus {
  status: 'Active' | 'ActivationRequired' | 'Expired' | 'Tampered';
  clinicId: string;
  clinicName: string;
  planTier: string;
  limits: FacilityLimits;
  activeStaffCount: number;
  enabledFeatures: string[];
  expiresAtUtc?: string;
  isTampered: boolean;
  errorMessage?: string;
  primaryLogoUrl?: string | null;
  primaryColorHex?: string | null;
  tenantSlug?: string | null;
  facilitySlug?: string | null;
}

export interface PatientQueueItem {
  id: string;
  tenantId: string;
  clinicId: string;
  queueNumber: string; // e.g. "Q-001"
  sequenceNumber: number;
  queueDate: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  doctorId?: string;
  doctorName?: string;
  priority: QueuePriority;
  status: QueueStatus;
  checkInTime: string;
  calledTime?: string;
  completedTime?: string;
  chiefComplaint?: string;
  hasVitals: boolean;
  vitalsSummary?: string;
  roomOrStation?: string;
  roomId?: string | null;
  visitType?: VisitType | string;
  visitWorkflowMode?: VisitWorkflowMode;
  dischargeNotes?: string;
  dischargedAt?: string;
  dischargedByStaffId?: string;
  divertedToFacility?: string;
  transportMode?: string;
  paramedicOrEscortName?: string;
  handoverSummary?: string;
  divertedAt?: string;
  divertedByStaffId?: string;
  isDirectVisit?: boolean;
}

export interface GetQueueParams {
  date?: string;
  status?: QueueStatus;
  doctorId?: string;
  roomOrStation?: string;
  roomId?: string;
  view?: QueueView | string;
}

export interface YakapClaimReadinessDto {
  isReady: boolean;
  encounterId: string;
  doctorPanValid: boolean;
  doctorPrcValid: boolean;
  patientPinValid: boolean;
  atcValid: boolean;
  symptomsValid: boolean;
  physicalExamComplete: boolean;
  primaryDiagnosisPresent: boolean;
  vitalsComplete: boolean;
  medicinesValid: boolean;
  missingFields: string[];
  warnings: string[];
  generalSurveyValid?: boolean;
  s2LicenseValid?: boolean;
}

export interface QueueMetrics {
  inQueue: number;
  urgentTriage: number;
  completedToday: number;
  totalCheckedIn: number;
  averageWaitTimeMinutes?: number;
}

export type RosCategoryCode =
  | 'EssentiallyNormal'
  | 'General'
  | 'Dermatologic'
  | 'Heent'
  | 'Respiratory'
  | 'Cardiovascular'
  | 'Gastrointestinal'
  | 'Genitourinary'
  | 'Musculoskeletal'
  | 'Neurological'
  | 'PsychiatricNeurodevelopmental'
  | 'EndocrineMetabolic'
  | 'HematologicLymphatic'
  | 'AllergicImmunologic';

export const ROS_CATEGORY_OPTIONS: ReadonlyArray<{ code: RosCategoryCode; label: string; shortLabel: string }> = [
  { code: 'EssentiallyNormal', label: 'Essentially Normal', shortLabel: 'Essentially Normal' },
  { code: 'General', label: 'General / Constitutional', shortLabel: 'General' },
  { code: 'Dermatologic', label: 'Dermatologic', shortLabel: 'Derma' },
  { code: 'Heent', label: 'HEENT', shortLabel: 'HEENT' },
  { code: 'Respiratory', label: 'Respiratory', shortLabel: 'Respi' },
  { code: 'Cardiovascular', label: 'Cardiovascular', shortLabel: 'Cardio' },
  { code: 'Gastrointestinal', label: 'Gastrointestinal', shortLabel: 'GI' },
  { code: 'Genitourinary', label: 'Genitourinary / OB-GYN', shortLabel: 'GU / OB-GYN' },
  { code: 'Musculoskeletal', label: 'Musculoskeletal', shortLabel: 'MSK' },
  { code: 'Neurological', label: 'Neurological', shortLabel: 'Neuro' },
  { code: 'PsychiatricNeurodevelopmental', label: 'Psychiatric / Neurodevelopmental', shortLabel: 'Psych' },
  { code: 'EndocrineMetabolic', label: 'Endocrine / Metabolic', shortLabel: 'Endocrine' },
  { code: 'HematologicLymphatic', label: 'Hematologic / Lymphatic', shortLabel: 'Heme' },
  { code: 'AllergicImmunologic', label: 'Allergic / Immunologic', shortLabel: 'Allergy / Immuno' },
];

export type ClinicDispenseSource = 'DoctorConsultation' | 'NurseVitalsCheck';
export type ClinicDispenseItemCategory = 'Medicine' | 'MedicalSupply';

export interface TriageDispensedItemInput {
  id?: string;
  itemName: string;
  itemCategory?: ClinicDispenseItemCategory | string;
  dosageOrSpec?: string;
  formOrUnit?: string;
  quantityDispensed: number;
  directionsOrInstructions?: string;
  rosCategory?: RosCategoryCode | string;
  isDoctorReviewed?: boolean;
  reviewedByDoctorName?: string | null;
}

export interface ClinicDispensingLogRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  queueItemId: string;
  queueNumber?: string | null;
  visitType?: string | null;
  source: ClinicDispenseSource | string;
  consultationEncounterId?: string | null;
  prescriptionItemId?: string | null;
  patientVitalsId?: string | null;
  itemName: string;
  itemCategory: ClinicDispenseItemCategory | string;
  dosageOrSpec?: string | null;
  formOrUnit: string;
  quantityDispensed: number;
  directionsOrInstructions?: string | null;
  rosCategory: RosCategoryCode | string;
  rosCategoryLabel: string;
  isConsultationValidated: boolean;
  dispensedByStaffId?: string | null;
  dispensedByStaffName: string;
  dispensedByRole: string;
  dispensedAt: string;
  chiefComplaint?: string | null;
  vitalsSummary?: string | null;
  preAssessmentNotes?: string | null;
  homeInstructions?: string | null;
  requiresDoctorReview: boolean;
  reviewedByDoctorId?: string | null;
  reviewedByDoctorName?: string | null;
  reviewedAt?: string | null;
  doctorReviewNotes?: string | null;
  interventionFlagged: boolean;
}

export interface TriageVitals {
  id: string;
  tenantId: string;
  clinicId: string;
  queueItemId: string;
  patientId: string;
  nurseId?: string;
  recordedByNurseName?: string;
  recordedAt: string;
  systolicBp?: number;
  diastolicBp?: number;
  heartRateBpm?: number;
  temperatureCelsius?: number;
  respiratoryRateBreathsPerMin?: number;
  oxygenSaturationPercent?: number;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  painScore?: number;
  notes?: string;
  visualAcuityLeft?: string;
  visualAcuityRight?: string;
  headCircumferenceCm?: number;
  midUpperArmCircumferenceCm?: number;
  isMeasuredRecumbent?: boolean;
  zScoreWeightForAge?: number;
  zScoreLengthForAge?: number;
  zScoreWeightForLength?: number;
  philHealthZScoreCategory?: string;
  philHealthZScoreCode?: string;
  growthZScoreCategory?: string;
  growthZScoreCode?: string;
  waistCircumferenceCm?: number;
  hipCircumferenceCm?: number;
  bodyLengthCm?: number;
  skinfoldThicknessMm?: number;
  limbsCircumferenceCm?: number;
  preAssessmentNotes?: string;
  preAssessmentRemarks?: string;
  triageAcuityReason?: string;
  homeInstructions?: string;
  rosCategory?: RosCategoryCode | string;
  rosCategoryLabel?: string;
  chiefComplaint?: string;
  dispensedItems?: ClinicDispensingLogRecord[];
}

export interface EncounterDiagnosis {
  id: string;
  icd10Code: string;
  description: string;
  isPrimary: boolean;
}

export interface PrescriptionItem {
  id: string;
  genericName: string;
  brandName?: string;
  dosage: string;
  form: string;
  sig: string;
  quantity: number;
  durationDays?: number;
  refills: number;
  isDangerousDrug: boolean;
  philHealthDrugCode?: string;
  remarks?: string;
  isClinicDispensed?: boolean;
  clinicDispensedQuantity?: number;
  clinicDispensedAt?: string;
  clinicDispensedBy?: string;
  rosCategory?: RosCategoryCode | string;
  rosCategoryLabel?: string;
}

export type VisitWorkflowMode = 'Regular' | 'YakapAvailment';

export interface PatientAddressDto {
  id?: string;
  addressType: 'Permanent' | 'Current' | 'Billing' | string;
  isSameAsPermanent: boolean;
  regionPsgc?: string | null;
  provincePsgc?: string | null;
  cityMunicipalityPsgc?: string | null;
  barangayPsgc?: string | null;
  regionName?: string | null;
  provinceName?: string | null;
  cityMunicipalityName?: string | null;
  barangayName?: string | null;
  streetAddress: string;
  zipCode?: string | null;
}

export interface PatientGuardianDto {
  id?: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  birthDate?: string | null;
  sex?: string | null;
  contactNumber: string;
  relationshipCode: string;
  relationshipOtherSpecify?: string | null;
  philHealthPin?: string | null;
  isPrimaryGuardian: boolean;
  isEmergencyContact: boolean;
}

export interface EncounterReviewOfSystemsItemDto {
  id?: string;
  system?: string;
  optionCode: string;
  symptomName?: string;
  isPertinentPositive?: boolean;
  painSite?: string | null;
  othersSpecifyText?: string | null;
  remarks?: string;
}

export interface PatientPhysicalExamFindingDto {
  id?: string;
  system: string;
  isNormal: boolean;
  findingTitle: string;
  optionCode?: string | null;
  bodySite?: string | null;
  laterality?: string | null;
  remarks?: string | null;
}

export interface PatientPhysicalExamDto {
  id?: string;
  generalSurveyId?: string;
  generalSurveyRemarks?: string;
  findings: PatientPhysicalExamFindingDto[];
}

export interface EncounterObGyneExamDto {
  id?: string;
  gravidity?: number | null;
  parity?: number | null;
  termBirths?: number | null;
  pretermBirths?: number | null;
  abortions?: number | null;
  livingChildren?: number | null;
  lmp?: string | null;
  edd?: string | null;
  gestationalAgeWeeks?: number | null;
  fundicHeightCm?: number | null;
  fetalHeartToneBpm?: number | null;
  fetalPresentation?: string | null;
  remarks?: string | null;
}

export interface EncounterPediatricMilestoneDto {
  id?: string;
  milestoneVisitAge?: string | null;
  grossMotorStatus?: string | null;
  fineMotorStatus?: string | null;
  languageStatus?: string | null;
  cognitiveStatus?: string | null;
  socialEmotionalStatus?: string | null;
  dangerSigns?: string[];
  remarks?: string | null;
}

export interface EncounterAdolescentAssessmentDto {
  id?: string;
  tannerStage?: number | null;
  smrBreastRating?: string | null;
  smrGenitalRating?: string | null;
  smrPubicHairRating?: string | null;
  menarcheAgeYears?: number | null;
  isSexuallyActive?: boolean;
  substanceUseNoted?: boolean;
  depressionScreenPositive?: boolean;
  remarks?: string | null;
}

export interface EncounterHeadsssDomainAssessmentDto {
  id?: string;
  domain: string;
  assessmentText: string;
  hasRedFlags?: boolean;
  redFlags?: string[];
}

export interface PatientBpMonitoringLogDto {
  id?: string;
  recordedAt: string;
  systolic: number;
  diastolic: number;
  pulseBpm?: number | null;
  location?: string | null;
  arm?: 'Left' | 'Right' | string | null;
  remarks?: string | null;
}

export interface DraftDiagnosticOrderDto {
  serviceItemId?: string;
  code?: string;
  name: string;
  category: string;
  standardPrice: number;
  philHealthCode?: string;
  fulfillmentMode: 'in_house' | 'outside';
  instructions?: string;
}

export interface DraftProcedureOrderDto {
  serviceItemId?: string;
  code?: string;
  name: string;
  category: string;
  standardPrice: number;
  instructions?: string;
  roomId?: string;
  roomName?: string;
  targetRoomId?: string;
  targetRoomName?: string;
  status?: 'draft' | 'sent_to_room' | string;
  isHandedOff?: boolean;
  handedOffAt?: string;
  toothNumber?: number;
  toothSurface?: string;
  procedureId?: string;
}

export interface DraftDentalToothDto {
  toothNumber: number;
  status: string;
  surface?: string | null;
  notes?: string | null;
}

export interface ConsultationDraftWorkspaceDto {
  cdsOverrideReason?: string | null;
  cdsOverrideConfirmed?: boolean | null;
  planHasMedicationPrescription?: boolean | null;
  planHasReferral?: boolean | null;
  planHasCancerScreening?: boolean | null;
  planHasFollowUp?: boolean | null;
  planDiagnosticServicesOption?: 'N' | 'Y' | 'R' | null;
  medCertFitness?: string | null;
  medCertRestDays?: string | null;
  medCertPurpose?: string | null;
  medCertRemarks?: string | null;
  refFacility?: string | null;
  refDepartment?: string | null;
  refUrgency?: string | null;
  refReason?: string | null;
  refSummary?: string | null;
  rxShowAddForm?: boolean | null;
  rxDraftGeneric?: string | null;
  rxDraftDosage?: string | null;
  rxDraftForm?: string | null;
  rxDraftSig?: string | null;
  rxDraftQuantity?: string | null;
  rxDraftClinicDispensedQty?: string | null;
  rxDraftDangerous?: boolean | null;
  rxDraftDrugCode?: string | null;
  rosCategories?: RosCategoryCode[] | string[] | null;
}

export interface ConsultationRecord {
  id: string;
  visitWorkflowMode?: VisitWorkflowMode;
  tenantId: string;
  clinicId: string;
  queueItemId?: string;
  appointmentId?: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  encounterDate: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  homeInstructions?: string;
  doctorPrcLicense?: string;
  doctorPtr?: string;
  doctorS2License?: string;
  doctorPhilHealthPan?: string;
  philHealthAtc?: string;
  hciCaseNo?: string;
  hciTransNo?: string;
  soapTransNo?: string;
  generalSurveyId?: string;
  generalSurveyRemarks?: string;
  physicalExamFindingsJson?: string;
  isSigned: boolean;
  signedAt?: string;
  diagnoses: EncounterDiagnosis[];
  prescriptions: PrescriptionItem[];
  isYakapEligible?: boolean;
  philHealthSignSympCode?: string;
  philHealthOtherComplaint?: string;
  philHealthPainSite?: string;
  philHealthCaseNo?: string;
  philHealthSoapTransNo?: string;
  syncStatus?: SyncStatus;
  prescriptionNumber?: string;
  rxPublicVerificationToken?: string;
  rxDispenseStatus?: 'Pending' | 'Dispensed' | 'DispensedExternally' | 'PartiallyDispensed' | 'Cancelled';
  rxDispensedPharmacyName?: string;
  rxDispensedAt?: string;
  rxDispensedPharmacistName?: string;
  rxDispensedPharmacistPrc?: string;
  rxDispensedReceiptNumber?: string;
  rxDispenseNotes?: string;
  physicalExams?: PatientPhysicalExamDto[];
  reviewOfSystemsItems?: EncounterReviewOfSystemsItemDto[];
  obGyneExam?: EncounterObGyneExamDto | null;
  pediatricMilestones?: EncounterPediatricMilestoneDto[];
  adolescentAssessment?: EncounterAdolescentAssessmentDto | null;
  headsssAssessments?: EncounterHeadsssDomainAssessmentDto[];
  bpMonitoringLogs?: PatientBpMonitoringLogDto[];
  counselingCodes?: string | null;
  routineVaccineName?: string | null;
  routineVaccineDate?: string | null;
  adultsRoutineScreeningCode?: string | null;
  pediatricRoutineScreeningCode?: string | null;
  prenatalScreeningServicesCode?: string | null;
  cancerScreeningCodes?: string | null;
  diagnosticServicesOption?: string | null;
  hasMedicationPrescription?: boolean;
  hasReferral?: boolean;
  otherMedicalAdviceSpec?: string | null;
  hasFollowUp?: boolean;
  followUpDate?: string | null;
  followUpScheduleText?: string | null;
  followUpReason?: string | null;
  followUpVaccineName?: string | null;
  followUpVaccineNextDate?: string | null;
  rosCategory?: RosCategoryCode | string;
  rosCategoryLabel?: string;
  rosCategories?: RosCategoryCode[] | string[] | null;
  createdAt?: string;
  updatedAt?: string;
  draftDiagnosticOrders?: DraftDiagnosticOrderDto[] | null;
  draftProcedures?: DraftProcedureOrderDto[] | null;
  draftDentalTeeth?: DraftDentalToothDto[] | null;
  draftWorkspace?: ConsultationDraftWorkspaceDto | null;
}

// ============================================================================
// Teleconsultation & Virtual Care DTOs (Milestone 5)
// ============================================================================

export type TeleconsultPaymentPolicy = 'Prepaid' | 'Postpaid' | 'Exempt';
export type TeleconsultPaymentStatus = 'Pending' | 'Paid' | 'Exempt' | 'Overridden';
export type TeleconsultRecordingPolicy = 'Disabled' | 'WorkspaceVaultOnly' | 'Both';
export type AppointmentType = 'InPerson' | 'Teleconsult';

export interface EmergencyOverrideDto {
  reasonCode?: string;
  reasonNote?: string;
}

export type EmergencyOverrideInput = EmergencyOverrideDto;

export interface AdmitTeleconsultPatientPayload {
  appointmentId: string;
  emergencyOverride?: EmergencyOverrideDto | null;
}

export interface TeleconsultAdmissionResultDto {
  appointmentId: string;
  callId: string;
  roomName: string;
  admittedAtUtc: string;
  paymentStatus: TeleconsultPaymentStatus | string;
  isEmergencyOverride: boolean;
}

export interface TeleconsultStatusDto {
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorId?: string;
  clinicianName?: string;
  scheduledAt?: string;
  scheduledTime?: string;
  appointmentType?: AppointmentType | string;
  paymentPolicy: TeleconsultPaymentPolicy | string;
  paymentStatus: TeleconsultPaymentStatus | string;
  canAdmit: boolean;
  hasActiveYakapEnlistment: boolean;
  callId?: string | null;
  isEmergencyOverride: boolean;
  overrideReason?: string | null;
  emergencyOverrideReasonCode?: string | null;
  invoiceId?: string | null;
  recordingPolicy?: 'Disabled' | 'WorkspaceVaultOnly' | 'Both' | string;
  recordingConsentRequired?: boolean;
  activeRecordingSessionId?: string | null;
  isYakapExempt?: boolean;
  admittedAtUtc?: string | null;
}

export interface TeleconsultCallJoinDto {
  appointmentId?: string;
  callId: string;
  roomName: string;
  relayUrl?: string | null;
  clinicianToken?: string | null;
  participantIdentity?: string;
  mediaAvailable?: boolean;
  mediaStatusMessage?: string | null;
  recordingPolicy?: TeleconsultRecordingPolicy | string;
  recordingConsentRequired?: boolean;
  accessToken?: string | null;
  token?: string | null;
  liveKitServerUrl?: string | null;
  isFallbackToken?: boolean;
  expiresAtUtc?: string | null;
}

export interface TeleconsultCallEndResultDto {
  appointmentId: string;
  callId: string;
  roomName: string;
  endedAtUtc: string;
  status: string;
  recordingFinalized?: boolean;
  wormAuditLogged?: boolean;
  commsCallStateChangedEnqueued?: boolean;
}

export interface TeleconsultGuestInviteDto {
  inviteToken: string;
  inviteUrl: string;
  otp: string;
  expiresAtUtc: string;
  dobHint?: string | null;
}

export interface RecordingSessionDto {
  id: string;
  tenantId?: string;
  clinicId?: string;
  callId: string;
  appointmentId?: string | null;
  consultationId?: string | null;
  patientId?: string;
  patientName?: string;
  doctorId?: string;
  doctorName?: string;
  status?: 'Recording' | 'Finalized' | 'Purged' | string;
  consentStatus?: 'none' | 'requested' | 'approved' | 'declined' | 'revoked' | string;
  recordingState?:
    | 'Initializing'
    | 'ReadyToRecord'
    | 'Recording'
    | 'Paused'
    | 'Blocked'
    | 'Finalizing'
    | 'Completed'
    | 'Aborted'
    | 'Purged'
    | string;
  storagePolicy?: string;
  totalDurationSeconds?: number;
  durationSeconds?: number;
  segmentCount?: number;
  totalSizeBytes?: number;
  sizeBytes?: number;
  containerFormat?: string;
  manifestStorageKey?: string | null;
  hasGaps?: boolean;
  retentionPolicyDays?: number;
  expiresAtUtc?: string | null;
  isLegalHold?: boolean;
  hasLegalHold?: boolean;
  legalHoldReason?: string | null;
  isPurged?: boolean;
  createdAt?: string;
}

export type TeleconsultRecordingSessionDto = RecordingSessionDto;

export interface RecordingSegmentDto {
  id: string;
  sessionId: string;
  segmentIndex: number;
  durationMs: number;
  storageKey?: string;
  sizeBytes?: number;
  sha256Checksum?: string;
  receivedAtUtc?: string;
}

export interface PlaybackTicketDto {
  ticket: string;
  expiresAtUtc: string;
  streamUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  hasLegalHold?: boolean;
  legalHoldReason?: string;
}

export type TeleconsultPlaybackTicketDto = PlaybackTicketDto;

export interface RequestRecordingConsentPayload {
  callId?: string;
  patientId?: string;
  doctorId?: string;
  appointmentId?: string | null;
  consultationId?: string | null;
  containerFormat?: string | null;
  policy?: TeleconsultRecordingPolicy | string;
}

export interface PatientConsentPayload {
  approved?: boolean;
  consented?: boolean;
  rejectionReason?: string | null;
  refusalReason?: string | null;
}

export interface AppointmentItem {
  id: string;
  tenantId?: string;
  clinicId: string;
  draftId?: string;
  patientId: string;
  patientName: string;
  doctorId?: string;
  doctorName?: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  serviceType?: string;
  reason?: string;
  notes?: string;
  createdAt: string;
  reminder24hSent?: boolean;
  reminder2hSent?: boolean;
  reminder24hSentAt?: string | null;
  reminder2hSentAt?: string | null;
  lastReminderSentAt?: string | null;
  lastReminderType?: string | null;

  // Teleconsultation properties (Milestone 2 & Milestone 5)
  appointmentType?: 'InPerson' | 'Teleconsult' | string;
  isTeleconsult?: boolean;
  paymentPolicy?: TeleconsultPaymentPolicy | string;
  paymentStatus?: TeleconsultPaymentStatus | string;
  invoiceId?: string | null;
  paidAmount?: number | null;
  callId?: string | null;
  admittedAtUtc?: string | null;
  isEmergencyOverride?: boolean;
  emergencyOverrideReasonCode?: string | null;
  hasActiveYakapEnlistment?: boolean;
}

export interface GetAppointmentsOptions {
  date?: string;
  startDate?: string;
  endDate?: string;
  doctorId?: string;
  status?: AppointmentStatus;
}

export interface RescheduleAppointmentRequest {
  newScheduledAt: string;
  durationMinutes?: number;
  reason?: string;
}

export interface DoctorBreakTimeItem {
  id?: string;
  description: string;
  startTime: string;
  endTime: string;
}

export interface DoctorScheduleTemplateItem {
  id: string;
  doctorId: string;
  doctorName: string;
  dayOfWeek: number | string;
  startTime: string;
  endTime: string;
  isOvernightShift: boolean;
  slotDurationMinutes: number;
  maxPatientsPerSlot: number;
  isActive: boolean;
  effectiveStartDate: string;
  effectiveEndDate?: string;
  breaks: DoctorBreakTimeItem[];
}

export interface AvailableSlotItem {
  startTime: string;
  endTime: string;
  slotStartUtc: string;
  slotEndUtc: string;
  isAvailable: boolean;
  status: 'Available' | 'Booked' | 'Break' | 'Past' | 'OnLeave';
  existingAppointmentId?: string;
  patientName?: string;
  notes?: string;
  time?: string;
  available?: boolean;
  reason?: string;
}

export interface DoctorAvailabilityData {
  doctorId: string;
  doctorName: string;
  date: string;
  isOnDuty: boolean;
  nonAvailabilityReason?: string;
  slots: AvailableSlotItem[];
  availableSlots?: AvailableSlotItem[];
}

export interface DoctorLeaveItem {
  id: string;
  doctorId?: string;
  doctorName: string;
  startDate: string;
  endDate: string;
  partialDayStartTime?: string;
  partialDayEndTime?: string;
  reason?: string;
  status: string;
  leaveType?: string;
  createdAt: string;
}

export interface Icd10Code {
  code: string;
  description: string;
}

export interface ClinicServiceItem {
  id: string;
  tenantId: string;
  clinicId: string;
  code: string;
  name: string;
  category: string;
  standardPrice: number;
  description?: string;
  isActive: boolean;
  philHealthCode?: string;
  philHealthDescription?: string;
  isPhilHealthFormulary?: boolean;
  isNurseOrderable?: boolean;
}

export interface BulkImportServiceItem {
  code: string;
  name: string;
  category: string;
  standardPrice: number;
  description?: string;
  philHealthCode?: string;
  philHealthDescription?: string;
  isPhilHealthFormulary?: boolean;
  isNurseOrderable?: boolean;
}

export interface BulkImportResult {
  totalProcessed: number;
  totalCreated: number;
  totalUpdated: number;
  totalMappedToPhilHealth: number;
  totalNonFormulary: number;
  items: ClinicServiceItem[];
}

export interface InvoiceLineItem {
  id: string;
  serviceItemId?: string;
  itemCode?: string;
  description: string;
  category: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  doctorId?: string;
  doctorName?: string;
}

export interface PaymentRecord {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  receivedByStaffName?: string;
  notes?: string;
}

export interface InvoiceRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  invoiceNumber: string;
  invoiceDate: string;
  patientId?: string;
  patientName: string;
  isWalkInRetail?: boolean;
  walkInCustomerName?: string;
  visitType?: VisitType;
  queueItemId?: string;
  appointmentId?: string;
  consultationId?: string;
  attendingDoctorId?: string;
  attendingDoctorName?: string;
  grossAmount: number;
  discountType: DiscountType;
  discountIdNumber?: string;
  discountPercentage: number;
  discountAmount: number;
  netAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  billingRequestedAt?: string;
  notes?: string;
  billedByStaffName?: string;
  lineItems: InvoiceLineItem[];
  payments: PaymentRecord[];
}

export interface ClinicalProcedureRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  queueItemId?: string;
  consultationId?: string;
  procedureCode?: string;
  procedureName: string;
  category: string;
  orderedByDoctorId?: string;
  orderedByDoctorName?: string;
  performedByStaffId?: string;
  performedByStaffName?: string;
  performedAt?: string;
  scheduledAt: string;
  status: ProcedureStatus;
  preProcedureVitalsJson?: string;
  postProcedureVitalsJson?: string;
  medicationAdministered?: string;
  lotNumber?: string;
  expirationDate?: string;
  siteRoute?: string;
  clinicalNotes?: string;
  complications?: string;
  targetRoomId?: string | null;
  targetRoomName?: string | null;
  toothNumber?: number | null;
  toothSurface?: string | null;
  createdBy?: string;
}

export interface ClinicLabOrderItem {
  id: string;
  testName: string;
  category: string;
  instructions?: string;
  status: LabOrderStatus;
}

/** Interoperable lab-order lifecycle (richer than the legacy `LabOrderStatus`). Serialized as a string. */
export type LabOrderStage =
  | 'Issued'
  | 'Routed'
  | 'Claimed'
  | 'AwaitingPayment'
  | 'Paid'
  | 'SpecimenCollected'
  | 'InProcess'
  | 'ResultFinalized'
  | 'ExternalSubmitted'
  | 'Reviewed'
  | 'Rejected'
  | 'Cancelled';

export type LabResultSource = 'ClinicEzLab' | 'ExternalLab' | 'PatientUploaded';
export type LabResultVerificationState = 'Verified' | 'Unverified' | 'Rejected';

/** Compact result summary attached to a lab order. `source` / `verificationState` are strings from the API. */
export interface ClinicLabOrderResultSummary {
  id: string;
  source: string;
  verificationState: string;
}

export interface ClinicLabOrderRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
  queueItemId?: string;
  isSigned?: boolean;
  orderedByDoctorId?: string;
  orderedByDoctorName?: string;
  orderDate: string;
  orderedAt?: string;
  status: LabOrderStatus;
  /** Interop lifecycle stage; absent on servers that predate the interop hub. */
  stage?: LabOrderStage;
  stageReason?: string | null;
  quotedAmount?: number | null;
  quotedCurrency?: string | null;
  paymentRequired?: boolean;
  laboratoryName?: string | null;
  claimToken?: string | null;
  results?: ClinicLabOrderResultSummary[];
  clinicalDiagnosis?: string;
  notes?: string;
  items: ClinicLabOrderItem[];
  testName?: string;
  specimenType?: string;
  /** Absolute URL of the public upload page for external labs (null when none). */
  publicUploadUrl?: string | null;
  externalLabName?: string;
  externalReportUrl?: string;
  externalReportType?: string;
  uploadedBy?: string;
  observationsJson?: string;
  pathologistImpression?: string;
  verifiedByPathologist?: string;
  pathologistPrcLicense?: string;
  reportReleasedAt?: string;
  hasCriticalPanicAlert?: boolean;
  criticalFindingsJson?: string;
  criticalFindings?: string;
  panicAlertTriggeredAt?: string;
  panicAcknowledgedAt?: string;
  panicAcknowledgedBy?: string;
  isPanicAcknowledged?: boolean;
}

/**
 * Redeem a patient's share: a scanned QR / pasted token, or (leave `shareToken` out) the patient's Clinic EZ ID plus the
 * one-time code they read out.
 */
export interface RedeemShareTokenRequest {
  shareToken?: string;
  clinicEzId?: string;
  code?: string;
  purpose?: string;
  addToQueue?: boolean;
  chiefComplaint?: string;
}

export interface RedeemShareTokenResult {
  correlationId: string;
}

export type ShareImportState = 'Pending' | 'Imported' | 'Denied' | 'Failed';

/** Why the patient plane refused a redeem; only present on `Denied`. */
export type ShareDenialCode = 'Invalid' | 'Expired' | 'Exhausted' | 'PatientUnknown' | 'RateLimited' | 'Revoked';

export interface ShareImportStatusDto {
  correlationId: string;
  status: ShareImportState;
  denialReason?: string | null;
  denialCode?: ShareDenialCode | null;
  /** Clinic patient id (use to open the patient). */
  patientId?: string | null;
  patientName?: string | null;
  clinicEzId?: string | null;
  /** SharingScopes flag names, e.g. 'Demographics', 'LabResults'. */
  scopes: string[];
  expiresAtUtc?: string | null;
  itemsImported: number;
  /** Which use of the share this was (1-based), when the patient plane reports it. */
  redemptionNumber?: number | null;
  maxRedemptions?: number | null;
  /** True when this clinic had already redeemed the same grant and the chart was refreshed. */
  isRefresh: boolean;
  queueItemId?: string | null;
  queueNumber?: string | null;
  requestedAtUtc: string;
  completedAtUtc?: string | null;
}

export type LabResultReviewScope = 'mine' | 'all';

export interface LabResultReviewItem {
  id: string;
  labOrderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  orderedByDoctorName?: string | null;
  testNames: string[];
  source: LabResultSource;
  verificationState: LabResultVerificationState;
  externalLabName?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  fileSizeBytes?: number | null;
  submittedAtUtc: string;
  verifiedByName?: string | null;
  verifiedAtUtc?: string | null;
  remarks?: string | null;
  hasPanicAlert: boolean;
}

export interface ReviewLabResultRequest {
  accepted: boolean;
  remarks?: string;
}

export type CdsAlertSeverity = 'Information' | 'Moderate' | 'Major' | 'Critical';
export type CdsAlertType = 'DrugAllergy' | 'DrugDrugInteraction' | 'RenalDoseAdjustment' | 'LabValueWarning';

export interface CdsAlert {
  alertId: string;
  ruleId?: string;
  type: CdsAlertType;
  category?: string;
  severity: CdsAlertSeverity;
  title: string;
  message?: string;
  clinicalMechanism: string;
  recommendation: string;
  clinicalRecommendation?: string;
  offendingDrug: string;
  interactingDrug?: string;
  requiresOverrideReason: boolean;
}

export interface EvaluateCdsResponse {
  hasCriticalAlerts: boolean;
  requiresOverride: boolean;
  alerts: CdsAlert[];
  patientAllergiesEvaluated?: string;
  latestCreatinine?: number;
  latestEgfr?: number;
  latestPotassium?: number;
}

export interface PaymentModeSummary {
  method: string;
  totalAmount: number;
  transactionCount: number;
}

export interface DoctorWorkloadSummary {
  doctorName: string;
  encountersCount: number;
}

export interface DailyEodReport {
  reportDate: string;
  tenantId: string;
  clinicId: string;
  totalCheckedIn: number;
  totalWalkIns: number;
  totalAppointments: number;
  totalCompletedVisits: number;
  totalWaitingOrInConsultation: number;
  totalGrossAmount: number;
  totalDiscountsGiven: number;
  totalSeniorDiscounts: number;
  totalPwdDiscounts: number;
  totalPhilHealthCovered: number;
  totalNetAmount: number;
  totalAmountCollected: number;
  cashInDrawer: number;
  totalUnpaidBalances: number;
  collectionsByMethod: PaymentModeSummary[];
  doctorWorkloads: DoctorWorkloadSummary[];
  totalProceduresPerformed: number;
  totalLabOrdersIssued: number;
  totalPrescriptionsWritten: number;
  totalDangerousDrugPrescriptions: number;
}

export interface FlowAnalytics {
  totalEncountersToday: number;
  inQueueNow: number;
  urgentTriageNow: number;
  inConsultationNow: number;
  completedToday: number;
  averageWaitMinutes: number;
  averageConsultMinutes: number;
  routineCount: number;
  urgentCount: number;
  emergencyCount: number;
}

export interface DailyTrendPoint {
  dateLabel: string;
  revenue: number;
  patientCount: number;
}

export interface TenderShare {
  method: string;
  totalAmount: number;
  percentage: number;
}

export interface MorbidityItem {
  icd10Code: string;
  description: string;
  caseCount: number;
  percentageShare: number;
}

export interface ServiceUsage {
  itemType: string;
  itemName: string;
  quantity: number;
}

export interface DoctorStat {
  doctorName: string;
  encountersCount: number;
  totalBilled: number;
}

export interface HourlyFlowPoint {
  hour: number;
  hourLabel: string;
  checkInCount: number;
  percentage: number;
}

export interface VisitTypeSplit {
  walkInCount: number;
  walkInPercentage: number;
  appointmentCount: number;
  appointmentPercentage: number;
}

export interface AcuitySplit {
  routineCount: number;
  routinePercentage: number;
  urgentCount: number;
  urgentPercentage: number;
  emergencyCount: number;
  emergencyPercentage: number;
}

export interface DemographicDistribution {
  pediatricCount: number;
  pediatricPercentage: number;
  adultCount: number;
  adultPercentage: number;
  seniorCount: number;
  seniorPercentage: number;
  maleCount: number;
  malePercentage: number;
  femaleCount: number;
  femalePercentage: number;
  otherCount: number;
  otherPercentage: number;
}

export interface FinancialEfficiency {
  collectionEfficiencyRate: number;
  discountImpactRate: number;
  averageRevenuePerPatient: number;
  totalDiscounts: number;
}

export interface ClinicAnalytics {
  startDate: string;
  endDate: string;
  tenantId: string;
  clinicId: string;
  flow: FlowAnalytics;
  totalGrossRevenue: number;
  totalNetRevenue: number;
  totalCollections: number;
  totalUnpaidBalances: number;
  averageTicketSize: number;
  seniorDiscountsGiven: number;
  pwdDiscountsGiven: number;
  revenueTrend: DailyTrendPoint[];
  tenderShares: TenderShare[];
  topDiagnoses: MorbidityItem[];
  topServices: ServiceUsage[];
  doctorStats: DoctorStat[];
  hourlyFlow?: HourlyFlowPoint[];
  visitTypeSplit?: VisitTypeSplit;
  acuitySplit?: AcuitySplit;
  demographics?: DemographicDistribution;
  financialEfficiency?: FinancialEfficiency;
}

export interface MorbidityDiseaseRow {
  rank: number;
  icd10Code: string;
  description: string;
  totalCases: number;
  pediatricCases: number;
  adultCases: number;
  seniorCases: number;
  maleCases: number;
  femaleCases: number;
  percentageOfTotal: number;
}

export interface MorbidityReport {
  startDate: string;
  endDate: string;
  tenantId: string;
  clinicId: string;
  clinicName: string;
  totalEncountersReviewed: number;
  totalDiagnosesRecorded: number;
  diseases: MorbidityDiseaseRow[];
}

export interface TaxDiscountAuditRow {
  invoiceNumber: string;
  invoiceDate: string;
  patientName: string;
  discountType: string;
  identificationCardNumber?: string;
  grossAmount: number;
  discountAmount: number;
  vatExemptSales: number;
  vatAmountExempted: number;
  netAmount: number;
  amountPaid: number;
  officialReceiptNumber?: string;
  paymentMethod?: string;
}

export interface TaxDiscountAuditReport {
  startDate: string;
  endDate: string;
  tenantId: string;
  clinicId: string;
  totalInvoicesAudited: number;
  totalGrossSales: number;
  totalSeniorDiscounts: number;
  totalPwdDiscounts: number;
  totalVatExempted: number;
  totalNetCollections: number;
  items: TaxDiscountAuditRow[];
}

export interface DoctorWorkloadDetail {
  doctorId: string;
  doctorName: string;
  totalEncounters: number;
  totalProceduresAssisted: number;
  totalConsultationGross: number;
  totalProcedureGross: number;
  totalGrossGenerated: number;
  estimatedPhysicianShare: number;
  clinicFacilityShare: number;
}

export interface DoctorSharesReport {
  startDate: string;
  endDate: string;
  tenantId: string;
  clinicId: string;
  totalClinicEncounters: number;
  totalClinicGrossRevenue: number;
  totalPhysicianShares: number;
  totalFacilityShares: number;
  doctorShares: DoctorWorkloadDetail[];
}

export interface CensusSummary {
  totalCensus: number;
  newPatients: number;
  returningPatients: number;
  consultations: number;
  standaloneProcedures: number;
  diagnosticsOrLab: number;
  nonDoctorVisits: number;
  completedVisits: number;
  inConsultationOrWaiting: number;
  divertedVisits: number;
  cancelledOrNoShow: number;
  averageTurnaroundMinutes: number;
  distinctPatientsCount?: number;
  urgentAcuityCount?: number;
  emergencyAcuityCount?: number;
  // Aliases for compatibility
  consultationCount?: number;
  procedureCount?: number;
  vitalsCheckOnlyCount?: number;
  administrativeCount?: number;
  pediatricCount?: number;
  adultCount?: number;
  seniorCount?: number;
  pwdCount?: number;
  philHealthCount?: number;
  routineCount?: number;
  urgentCount?: number;
  emergencyCount?: number;
  completedCount?: number;
  divertedCount?: number;
  noShowCount?: number;
  cancelledCount?: number;
  visitsWithMedicineDispensing?: number;
  totalDispensedLineItems?: number;
  totalDispensedUnits?: number;
  prescriptionsIssued?: number;
  medicalCertificatesIssued?: number;
  referralsIssued?: number;
  labRequisitionsIssued?: number;
  vitalsCheckVisits?: number;
  inClinicProceduresCount?: number;
}

export interface CensusServiceBreakdown {
  serviceName: string;
  visitCount: number;
  totalVolume: number;
  percentage: number;
}

export interface CensusRosBreakdown {
  rosCategory: string;
  visitCount: number;
  dispensingCount: number;
  percentage: number;
}

export interface CensusDemographicsBreakdown {
  pediatricCount: number;
  pediatricPercentage?: number;
  adultCount: number;
  adultPercentage?: number;
  seniorCount: number;
  seniorPercentage?: number;
  maleCount: number;
  malePercentage?: number;
  femaleCount: number;
  femalePercentage?: number;
  otherGenderCount?: number;
  otherGenderPercentage?: number;
  otherCount?: number;
  seniorCitizenCount?: number;
  seniorOscaCount?: number;
  pwdCount: number;
  philHealthCount: number;
}

export interface CensusAcuityBreakdown {
  routineCount: number;
  routinePercentage?: number;
  urgentCount: number;
  urgentPercentage?: number;
  emergencyCount: number;
  emergencyPercentage?: number;
}

export interface CensusVisitTypeBreakdown {
  visitType: string;
  count: number;
  percentage?: number;
}

export interface CensusProviderBreakdown {
  staffId?: string;
  staffName: string;
  role: 'Doctor' | 'Nurse' | string;
  totalEncounters: number;
  completedEncounters: number;
}

export interface CensusServiceRow {
  subRowIndex: number;
  serviceName: string;
  serviceItemName?: string | null;
  serviceFee?: number;
  serviceTime?: string | null;
  referenceNumber?: string | null;
  attendingDoctor?: string | null;
  attendingNurse?: string | null;
  chiefComplaint?: string | null;
  nurseAssessment?: string | null;
  vitalsSnapshot?: string | null;
  doctorDiagnosis?: string | null;
  clinicalAssessment?: string | null;
  rosCategory?: string | null;
  systemsReviewed?: string | null;
  serviceDetails?: string | null;
  acuity?: string | null;
  disposition?: string | null;
}

export interface CensusItem {
  id?: string;
  sequenceNumber?: number;
  queueNumber: string;
  visitType: string;
  acuity: 'Routine' | 'Urgent' | 'Emergency' | string;
  outcomeStatus?: string;
  checkInTime: string;
  triageTime?: string | null;
  calledTime?: string | null;
  completedTime?: string | null;
  turnaroundMinutes?: number | null;
  patientId?: string;
  patientCode: string;
  patientName: string;
  age: number;
  sex: string;
  civilStatus?: string | null;
  classification?: string;
  classifications?: string[];
  customFields?: Record<string, any> | string | null;
  customFieldsSummary?: string;
  chiefComplaint?: string | null;
  attendingNurse?: string | null;
  nurseAssessment?: string | null;
  nurseImpression?: string | null;
  vitalsSnapshot?: string | null;
  attendingDoctor?: string | null;
  doctorDiagnosis?: string | null;
  clinicalAssessment?: string | null;
  systemsReviewed?: string | null;
  proceduresPerformed?: string | null;
  disposition?: string | null;
  billingStatus?: string | null;
  officialReceiptNumber?: string | null;
  amountPaid?: number | null;
  grossAmount?: number;
  netAmount?: number;
  balanceDue?: number;
  isNewPatient?: boolean;
  servicesAvailed?: string[];
  servicesAvailedSummary?: string | null;
  rosCategory?: string | null;
  dispensedMedicinesSummary?: string | null;
  prescriptionsCount?: number;
  medicalCertificatesCount?: number;
  referralsCount?: number;
  labRequisitionsCount?: number;
  serviceRows?: CensusServiceRow[];
  totalServiceFees?: number;
  consultationFee?: number;
  vitalsFee?: number;
}

const CENSUS_EMPTY_SENTINELS = new Set([
  '—',
  '-',
  'n/a',
  'n/a - non-doctor visit',
  'non-doctor visit',
  'pending diagnosis',
  'no vitals recorded',
  'none recorded',
  'none',
]);

function normalizeCensusField(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (CENSUS_EMPTY_SENTINELS.has(trimmed.toLowerCase())) return '';
  return trimmed;
}

export function mapCensusVisitTypeLabel(visitType?: string | null): string {
  switch ((visitType || '').trim()) {
    case 'RoutineCheckup':
    case 'Routine Checkup':
      return 'Routine Checkup';
    case 'AcuteIllnessConsultation':
    case 'Acute Illness Consultation':
      return 'Acute Illness Consultation';
    case 'ChronicDiseaseFollowUp':
    case 'Chronic Disease Follow-Up':
      return 'Chronic Disease Follow-Up';
    case 'PreventiveHealthAssessment':
    case 'Preventive Health Assessment':
      return 'Preventive Health Assessment';
    case 'UrgentCareVisit':
    case 'Urgent Care Visit':
      return 'Urgent Care Visit';
    default:
      return '';
  }
}

export function normalizeCensusDisplayField(value?: string | null): string {
  return normalizeCensusField(value);
}

/**
 * Resolves additional per-service sub-rows availed on top of the parent visit row.
 * Keeps the parent visit row (with its primary visit purpose, main attending MD & RN,
 * triage vitals, consultation diagnosis, outcome, and billing) intact, and emits
 * sub-rows only for additional services availed during that visit, each with its
 * providing staff and service-specific details.
 */
export function resolveCensusVisitServiceRows(
  item: CensusItem,
  dispensingLedger?: CensusDispensingLedgerEntry[],
): CensusServiceRow[] {
  const primaryService = mapCensusVisitTypeLabel(item.visitType);

  if (item.serviceRows) {
    return item.serviceRows
      .filter((row) => row.serviceName.trim().toLowerCase() !== primaryService.toLowerCase() || item.serviceRows!.length > 1 || row.subRowIndex >= 0)
      .filter((row) => {
        // Backend ServiceRows already contains only additional services on top of the visit;
        // guard against any legacy synthetic single-row echo of the primary visit with no extra details.
        if (
          item.serviceRows!.length === 1 &&
          row.serviceName.trim().toLowerCase() === primaryService.toLowerCase() &&
          !normalizeCensusField(row.referenceNumber) &&
          !normalizeCensusField(row.serviceDetails)
        ) {
          return false;
        }
        return true;
      })
      .map((row, idx) => ({
        subRowIndex: row.subRowIndex ?? idx,
        serviceName: row.serviceName,
        serviceItemName: normalizeCensusField(row.serviceItemName) || null,
        serviceFee: typeof row.serviceFee === 'number' ? row.serviceFee : 0,
        serviceTime: row.serviceTime ?? null,
        referenceNumber: normalizeCensusField(row.referenceNumber) || null,
        attendingDoctor: normalizeCensusField(row.attendingDoctor),
        attendingNurse: normalizeCensusField(row.attendingNurse),
        chiefComplaint: normalizeCensusField(row.chiefComplaint),
        nurseAssessment: normalizeCensusField(row.nurseAssessment),
        vitalsSnapshot: normalizeCensusField(row.vitalsSnapshot),
        doctorDiagnosis: normalizeCensusField(row.doctorDiagnosis),
        clinicalAssessment: normalizeCensusField(row.clinicalAssessment),
        rosCategory: normalizeCensusField(row.rosCategory),
        systemsReviewed: normalizeCensusField(row.systemsReviewed),
        serviceDetails: normalizeCensusField(row.serviceDetails),
        acuity: row.acuity || item.acuity || 'Routine',
        disposition: normalizeCensusField(row.disposition) || 'Completed',
      }));
  }

  const doc = normalizeCensusField(item.attendingDoctor);
  const nurse = normalizeCensusField(item.attendingNurse);
  const procs = normalizeCensusField(item.proceduresPerformed);
  const dispensedSummary = normalizeCensusField(item.dispensedMedicinesSummary);

  const rawServices =
    item.servicesAvailed && item.servicesAvailed.length > 0 ? [...item.servicesAvailed] : [];

  const matchingLedger = (dispensingLedger || []).filter(
    (entry) =>
      (item.id && entry.queueItemId && entry.queueItemId === item.id) ||
      (entry.queueNumber && entry.queueNumber === item.queueNumber),
  );

  const resolved: CensusServiceRow[] = [];
  let nextIdx = 0;

  for (const svc of rawServices) {
    const norm = svc.trim().toLowerCase();
    if (norm === primaryService.toLowerCase()) {
      // Primary visit is already displayed on the main visit row;
      // only emit extra procedure sub-rows if StandaloneProcedure had multiple comma-separated procedures.
      if (norm === 'in-clinic procedure' && procs.includes(',')) {
        const extraProcs = procs
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(1);
        for (const extraProc of extraProcs) {
          resolved.push({
            subRowIndex: nextIdx++,
            serviceName: 'In-Clinic Procedure',
            serviceTime: item.completedTime || item.calledTime || item.checkInTime,
            referenceNumber: null,
            attendingDoctor: '',
            attendingNurse: nurse,
            chiefComplaint: '',
            nurseAssessment: '',
            vitalsSnapshot: '',
            doctorDiagnosis: '',
            clinicalAssessment: '',
            rosCategory: '',
            systemsReviewed: '',
            serviceDetails: extraProc,
            acuity: item.acuity || 'Routine',
            disposition: 'Completed',
          });
        }
      }
      continue;
    }

    if (norm === 'in-clinic procedure') {
      const procParts = procs ? procs.split(',').map((p) => p.trim()).filter(Boolean) : [''];
      for (const procName of procParts) {
        resolved.push({
          subRowIndex: nextIdx++,
          serviceName: 'In-Clinic Procedure',
          serviceItemName: procName || null,
          serviceFee: 0,
          serviceTime: item.calledTime || item.completedTime || item.checkInTime,
          referenceNumber: null,
          attendingDoctor: isPhysicianConsultationVisitType(item.visitType) ? doc : '',
          attendingNurse: nurse,
          chiefComplaint: '',
          nurseAssessment: '',
          vitalsSnapshot: '',
          doctorDiagnosis: '',
          clinicalAssessment: '',
          rosCategory: '',
          systemsReviewed: '',
          serviceDetails: procName,
          acuity: item.acuity || 'Routine',
          disposition: 'Completed',
        });
      }
      continue;
    }

    if (norm === 'medicine dispensing') {
      if (matchingLedger.length > 0) {
        for (const entry of matchingLedger) {
          const isDoctorDisp = (entry.dispensedByRole || '').toLowerCase().includes('doctor');
          const categoryTag = (entry.itemCategory || '').toLowerCase().includes('supply')
            ? '[Supply]'
            : '[Medicine]';
          const detailParts = [
            `${categoryTag} ${entry.itemName}${entry.dosageOrSpec ? ` ${entry.dosageOrSpec}` : ''} x${entry.quantityDispensed} ${entry.formOrUnit || 'pcs'}`,
            entry.directionsOrInstructions ? entry.directionsOrInstructions : '',
          ].filter(Boolean);
          resolved.push({
            subRowIndex: nextIdx++,
            serviceName: 'Medicine Dispensing',
            serviceItemName: `${entry.itemName}${entry.dosageOrSpec ? ` ${entry.dosageOrSpec}` : ''} (x${entry.quantityDispensed})`,
            serviceFee: 0,
            serviceTime: entry.dispensedAt,
            referenceNumber: null,
            attendingDoctor: isDoctorDisp
              ? entry.dispensedByStaffName
              : entry.reviewedByDoctorName || '',
            attendingNurse: !isDoctorDisp ? entry.dispensedByStaffName : '',
            chiefComplaint: '',
            nurseAssessment: '',
            vitalsSnapshot: '',
            doctorDiagnosis: '',
            clinicalAssessment: '',
            rosCategory: '',
            systemsReviewed: '',
            serviceDetails: detailParts.join(' • '),
            acuity: item.acuity || 'Routine',
            disposition: 'Dispensed',
          });
        }
      } else {
        resolved.push({
          subRowIndex: nextIdx++,
          serviceName: 'Medicine Dispensing',
          serviceItemName: dispensedSummary || null,
          serviceFee: 0,
          serviceTime: item.completedTime || item.checkInTime,
          referenceNumber: null,
          attendingDoctor: isPhysicianConsultationVisitType(item.visitType) ? doc : '',
          attendingNurse: !isPhysicianConsultationVisitType(item.visitType) ? nurse : '',
          chiefComplaint: '',
          nurseAssessment: '',
          vitalsSnapshot: '',
          doctorDiagnosis: '',
          clinicalAssessment: '',
          rosCategory: '',
          systemsReviewed: '',
          serviceDetails: dispensedSummary ? `Dispensed: ${dispensedSummary}` : '',
          acuity: item.acuity || 'Routine',
          disposition: 'Dispensed',
        });
      }
      continue;
    }

    if (norm === 'prescription') {
      const rxCount = item.prescriptionsCount || 1;
      resolved.push({
        subRowIndex: nextIdx++,
        serviceName: 'Prescription',
        serviceItemName: `${rxCount} Rx item(s)`,
        serviceFee: 0,
        serviceTime: item.completedTime || item.checkInTime,
        referenceNumber: null,
        attendingDoctor: doc,
        attendingNurse: '',
        chiefComplaint: '',
        nurseAssessment: '',
        vitalsSnapshot: '',
        doctorDiagnosis: '',
        clinicalAssessment: '',
        rosCategory: '',
        systemsReviewed: '',
        serviceDetails: `${rxCount} signed prescription item(s)`,
        acuity: item.acuity || 'Routine',
        disposition: 'Issued',
      });
      continue;
    }

    if (norm === 'medical certificate') {
      const certCount = Math.max(1, item.medicalCertificatesCount || 1);
      for (let cIdx = 0; cIdx < certCount; cIdx++) {
        resolved.push({
          subRowIndex: nextIdx++,
          serviceName: 'Medical Certificate',
          serviceItemName: 'Medical Certificate',
          serviceFee: 0,
          serviceTime: item.completedTime || item.checkInTime,
          referenceNumber: null,
          attendingDoctor: doc,
          attendingNurse: '',
          chiefComplaint: '',
          nurseAssessment: '',
          vitalsSnapshot: '',
          doctorDiagnosis: '',
          clinicalAssessment: '',
          rosCategory: '',
          systemsReviewed: '',
          serviceDetails: 'Signed Medical Certificate',
          acuity: item.acuity || 'Routine',
          disposition: 'Issued',
        });
      }
      continue;
    }

    if (norm === 'referral') {
      const refCount = Math.max(1, item.referralsCount || 1);
      for (let rIdx = 0; rIdx < refCount; rIdx++) {
        resolved.push({
          subRowIndex: nextIdx++,
          serviceName: 'Referral',
          serviceItemName: 'Clinical Referral',
          serviceFee: 0,
          serviceTime: item.completedTime || item.checkInTime,
          referenceNumber: null,
          attendingDoctor: doc,
          attendingNurse: '',
          chiefComplaint: '',
          nurseAssessment: '',
          vitalsSnapshot: '',
          doctorDiagnosis: '',
          clinicalAssessment: '',
          rosCategory: '',
          systemsReviewed: '',
          serviceDetails: 'Signed Clinical Referral',
          acuity: item.acuity || 'Routine',
          disposition: 'Referred',
        });
      }
      continue;
    }

    if (norm === 'laboratory requisition') {
      const labCount = Math.max(1, item.labRequisitionsCount || 1);
      for (let lIdx = 0; lIdx < labCount; lIdx++) {
        resolved.push({
          subRowIndex: nextIdx++,
          serviceName: 'Laboratory Requisition',
          serviceItemName: 'Outside Diagnostic Order',
          serviceFee: 0,
          serviceTime: item.completedTime || item.checkInTime,
          referenceNumber: null,
          attendingDoctor: doc,
          attendingNurse: '',
          chiefComplaint: '',
          nurseAssessment: '',
          vitalsSnapshot: '',
          doctorDiagnosis: '',
          clinicalAssessment: '',
          rosCategory: '',
          systemsReviewed: '',
          serviceDetails: 'Signed Diagnostic Requisition',
          acuity: item.acuity || 'Routine',
          disposition: 'Issued',
        });
      }
      continue;
    }

    resolved.push({
      subRowIndex: nextIdx++,
      serviceName: svc,
      serviceItemName: null,
      serviceFee: 0,
      serviceTime: item.calledTime || item.completedTime || item.checkInTime,
      referenceNumber: null,
      attendingDoctor: doc,
      attendingNurse: nurse,
      chiefComplaint: '',
      nurseAssessment: '',
      vitalsSnapshot: '',
      doctorDiagnosis: '',
      clinicalAssessment: '',
      rosCategory: '',
      systemsReviewed: '',
      serviceDetails: '',
      acuity: item.acuity || 'Routine',
      disposition: 'Completed',
    });
  }

  return resolved;
}

/**
 * Resolves the complete list of strictly isolated service sub-rows rendered during a visit:
 * - Isolated "Vitals & Triage" sub-row (RN + CC + Vitals only)
 * - Isolated "Doctor Consultation" sub-row (MD + Dx + ROS + Consultation Fee only)
 * - Isolated 1..N "In-Clinic Procedure" sub-rows (each with specific procedure name & fee)
 * - Isolated 1..N "In-Clinic Diagnostic" sub-rows (each with specific test name & fee)
 * - Isolated 1 grouped "Diagnostic Order (Outside)" sub-row per outside requisition (₱0.00 clinic fee)
 * - Isolated "Medicine Dispensing", "Prescription", "Medical Certificate" (with fee), and "Referral" sub-rows
 */
export function resolveCensusIsolatedServiceRows(
  item: CensusItem,
  dispensingLedger?: CensusDispensingLedgerEntry[],
): CensusServiceRow[] {
  const visitTypeLabel = mapCensusVisitTypeLabel(item.visitType);
  const isConsultationVisit =
    isPhysicianConsultationVisitType(item.visitType) ||
    Boolean(normalizeCensusField(item.doctorDiagnosis)) ||
    (item.consultationFee ?? 0) > 0;

  const mainDoc = normalizeCensusField(item.attendingDoctor);
  const mainNurse = normalizeCensusField(item.attendingNurse);
  const mainCc = normalizeCensusField(item.chiefComplaint);
  const mainImpression = normalizeCensusField(item.nurseImpression || item.nurseAssessment);
  const mainVitals = normalizeCensusField(item.vitalsSnapshot);
  const mainDx = isConsultationVisit ? normalizeCensusField(item.doctorDiagnosis) : '';
  const mainRos = isConsultationVisit ? normalizeCensusField(item.rosCategory) : '';
  const mainAssessment = isConsultationVisit ? normalizeCensusField(item.clinicalAssessment) : '';
  const mainSystems = isConsultationVisit ? normalizeCensusField(item.systemsReviewed) : '';
  const nonConsultRos = !isConsultationVisit ? normalizeCensusField(item.rosCategory) : '';
  const nonConsultSystems = !isConsultationVisit ? normalizeCensusField(item.systemsReviewed) : '';

  const additionalSubRows = resolveCensusVisitServiceRows(item, dispensingLedger);
  const isolated: CensusServiceRow[] = [];
  let rowIndex = 0;

  const hasVitalsOrTriage =
    Boolean(mainVitals) ||
    Boolean(item.triageTime) ||
    Boolean(mainImpression && mainImpression !== mainCc) ||
    isNurseAssessmentVisitType(item.visitType) ||
    (Boolean(mainNurse) && !additionalSubRows.some((r) => r.attendingNurse === mainNurse));

  if (hasVitalsOrTriage) {
    isolated.push({
      subRowIndex: rowIndex++,
      serviceName: 'Vitals & Triage',
      serviceItemName: isNurseAssessmentVisitType(item.visitType)
        ? 'Preventive Health Triage'
        : null,
      serviceFee: item.vitalsFee ?? 0,
      serviceTime: item.triageTime || item.checkInTime,
      referenceNumber: null,
      attendingDoctor: '',
      attendingNurse: mainNurse,
      chiefComplaint: mainCc,
      nurseAssessment: mainImpression,
      vitalsSnapshot: mainVitals,
      doctorDiagnosis: '',
      clinicalAssessment: '',
      rosCategory: nonConsultRos,
      systemsReviewed: nonConsultSystems,
      serviceDetails: '',
      acuity: item.acuity || 'Routine',
      disposition: mainVitals ? 'Recorded' : normalizeCensusField(item.disposition) || 'Recorded',
    });
  }

  const hasDoctorConsultation =
    isConsultationVisit &&
    (Boolean(mainDoc) ||
      Boolean(mainDx) ||
      Boolean(mainAssessment) ||
      Boolean(mainSystems) ||
      (item.consultationFee ?? 0) > 0 ||
      additionalSubRows.length === 0);

  if (hasDoctorConsultation) {
    isolated.push({
      subRowIndex: rowIndex++,
      serviceName: 'Doctor Consultation',
      serviceItemName: visitTypeLabel || null,
      serviceFee: item.consultationFee ?? 0,
      serviceTime: item.calledTime || item.completedTime || item.checkInTime,
      referenceNumber: null,
      attendingDoctor: mainDoc,
      attendingNurse: '',
      chiefComplaint: !hasVitalsOrTriage ? mainCc : '',
      nurseAssessment: '',
      vitalsSnapshot: '',
      doctorDiagnosis: mainDx,
      clinicalAssessment: mainAssessment,
      rosCategory: mainRos,
      systemsReviewed: mainSystems,
      serviceDetails: '',
      acuity: item.acuity || 'Routine',
      disposition: normalizeCensusField(item.disposition) || 'Completed',
    });
  }

  for (const sub of additionalSubRows) {
    if (
      sub.serviceName === 'Laboratory Requisition' ||
      sub.serviceName === 'Diagnostic Order (Outside)'
    ) {
      const rawItemName = (sub.serviceItemName || '').trim();
      const isGroupedLabel =
        !rawItemName ||
        /^\d+\s+Tests/i.test(rawItemName) ||
        /^Outside Diagnostic Order$/i.test(rawItemName) ||
        rawItemName.includes(',');

      if (isGroupedLabel) {
        const [testsSegment, ...restSegments] = (sub.serviceDetails || '')
          .split('•')
          .map((s) => s.trim())
          .filter(Boolean);
        const parsedTests = (testsSegment || '')
          .split(',')
          .map((t) => t.trim())
          .filter(
            (t) =>
              Boolean(t) &&
              !/^signed diagnostic requisition$/i.test(t) &&
              !/^diagnostic requisition$/i.test(t),
          );

        if (parsedTests.length > 0) {
          for (const testName of parsedTests) {
            isolated.push({
              ...sub,
              subRowIndex: rowIndex++,
              serviceName: 'Diagnostic Order (Outside)',
              serviceItemName: testName,
              serviceDetails: [testName, ...restSegments].filter(Boolean).join(' • '),
              serviceFee: 0,
            });
          }
          continue;
        }
      }

      const cleanedItemName = rawItemName
        ? rawItemName.replace(/\s*\(Outside\)$/i, '').trim() || null
        : null;

      isolated.push({
        ...sub,
        subRowIndex: rowIndex++,
        serviceName: 'Diagnostic Order (Outside)',
        serviceItemName: cleanedItemName,
        serviceFee: 0,
      });
      continue;
    }

    isolated.push({
      ...sub,
      subRowIndex: rowIndex++,
      serviceName: sub.serviceName,
      serviceFee: typeof sub.serviceFee === 'number' ? sub.serviceFee : 0,
    });
  }

  if (isolated.length === 0) {
    isolated.push({
      subRowIndex: 0,
      serviceName: 'Pending Visit',
      serviceItemName: visitTypeLabel || null,
      serviceFee: 0,
      serviceTime: item.checkInTime,
      referenceNumber: null,
      attendingDoctor: mainDoc,
      attendingNurse: mainNurse,
      chiefComplaint: mainCc,
      nurseAssessment: '',
      vitalsSnapshot: '',
      doctorDiagnosis: '',
      clinicalAssessment: '',
      rosCategory: '',
      systemsReviewed: '',
      serviceDetails: '',
      acuity: item.acuity || 'Routine',
      disposition: normalizeCensusField(item.disposition) || 'Waiting',
    });
  }

  return isolated;
}

export interface CensusDispensingLedgerEntry {
  id: string;
  dispensedAt: string;
  queueItemId?: string | null;
  queueNumber?: string | null;
  patientName: string;
  visitType?: string | null;
  source: ClinicDispenseSource | 'Doctor Consultation' | 'Nurse Vitals Check' | string;
  itemName: string;
  itemCategory: ClinicDispenseItemCategory | 'Medical Supply' | 'Medicine' | string;
  dosageOrSpec?: string | null;
  formOrUnit?: string | null;
  quantityDispensed: number;
  directionsOrInstructions?: string | null;
  rosCategory: RosCategoryCode | string;
  rosCategoryLabel?: string | null;
  dispensedByStaffName: string;
  dispensedByRole: string;
  requiresDoctorReview?: boolean;
  isReviewedByDoctor?: boolean;
  reviewedAt?: string | null;
  reviewedByDoctorName?: string | null;
  interventionFlagged?: boolean;
}

export interface ResolvedCensusLedgerEntryMeta {
  isDoctorSource: boolean;
  sourceBadgeLabel: 'Doctor Consultation' | 'Nurse Vitals Check';
  isMedicalSupply: boolean;
  categoryBadgeLabel: 'Supply' | 'Medicine';
  isReviewedByDoctor: boolean;
  reviewBadgeLabel: string;
  reviewBadgeVariant: 'success' | 'emergency' | 'warning';
}

export function resolveCensusLedgerEntryMeta(
  entry: Pick<
    CensusDispensingLedgerEntry,
    | 'source'
    | 'itemCategory'
    | 'isReviewedByDoctor'
    | 'reviewedAt'
    | 'reviewedByDoctorName'
    | 'interventionFlagged'
  >,
): ResolvedCensusLedgerEntryMeta {
  const normalizedSource = (entry.source || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const isDoctorSource = normalizedSource === 'doctorconsultation' || normalizedSource.startsWith('doctor');

  const normalizedCategory = (entry.itemCategory || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const isMedicalSupply =
    normalizedCategory === 'medicalsupply' || normalizedCategory === 'supply' || normalizedCategory.includes('supply');

  const isReviewedByDoctor = isDoctorSource || Boolean(entry.isReviewedByDoctor) || Boolean(entry.reviewedAt);

  if (isDoctorSource) {
    return {
      isDoctorSource: true,
      sourceBadgeLabel: 'Doctor Consultation',
      isMedicalSupply,
      categoryBadgeLabel: isMedicalSupply ? 'Supply' : 'Medicine',
      isReviewedByDoctor: true,
      reviewBadgeLabel: 'Signed Consultation',
      reviewBadgeVariant: 'success',
    };
  }

  if (isReviewedByDoctor) {
    const doctorLabel = entry.reviewedByDoctorName || 'MD';
    return {
      isDoctorSource: false,
      sourceBadgeLabel: 'Nurse Vitals Check',
      isMedicalSupply,
      categoryBadgeLabel: isMedicalSupply ? 'Supply' : 'Medicine',
      isReviewedByDoctor: true,
      reviewBadgeLabel: entry.interventionFlagged
        ? `Intervention Flagged (${doctorLabel})`
        : `Reviewed (${doctorLabel})`,
      reviewBadgeVariant: entry.interventionFlagged ? 'emergency' : 'success',
    };
  }

  return {
    isDoctorSource: false,
    sourceBadgeLabel: 'Nurse Vitals Check',
    isMedicalSupply,
    categoryBadgeLabel: isMedicalSupply ? 'Supply' : 'Medicine',
    isReviewedByDoctor: false,
    reviewBadgeLabel: 'Pending Async MD Review',
    reviewBadgeVariant: 'warning',
  };
}

export interface CensusServiceItemBreakdown {
  itemName: string;
  count: number;
}

export interface ClinicCensusReport {
  startDate: string;
  endDate: string;
  tenantId?: string;
  clinicId?: string;
  clinicName?: string | null;
  facilityName?: string;
  facilityAddress?: string | null;
  accreditationNumber?: string | null;
  generatedAt: string;
  generatedByStaffName?: string | null;
  summary: CensusSummary;
  demographics: CensusDemographicsBreakdown;
  acuity?: CensusAcuityBreakdown;
  visitTypes?: CensusVisitTypeBreakdown[];
  providers?: CensusProviderBreakdown[];
  items: CensusItem[];
  dispensingLedger?: CensusDispensingLedgerEntry[];
  serviceBreakdown?: CensusServiceBreakdown[];
  rosBreakdown?: CensusRosBreakdown[];
  pageNumber?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  itemizedProcedures?: CensusServiceItemBreakdown[];
  itemizedInClinicDiagnostics?: CensusServiceItemBreakdown[];
  itemizedOutsideDiagnostics?: CensusServiceItemBreakdown[];
}

export interface CensusFilterOptions {
  doctorId?: string;
  nurseId?: string;
  visitType?: string;
  tableVisitType?: string;
  acuity?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PatientProblemRecord {
  id: string;
  clinicId: string;
  patientId: string;
  consultationEncounterId?: string;
  icd10Code: string;
  problemTitle: string;
  philHealthMdiseaseCode?: string;
  status: 'Active' | 'Resolved' | 'Inactive' | 'Relapsed';
  severity: 'Mild' | 'Moderate' | 'Severe';
  isChronicNcd: boolean;
  onsetDate?: string;
  resolvedDate?: string;
  clinicalNotes?: string;
  recordedByDoctorId: string;
  recordedByDoctorName: string;
  createdAt: string;
}

export interface CreatePatientProblemPayload {
  consultationEncounterId?: string;
  icd10Code: string;
  problemTitle: string;
  philHealthMdiseaseCode?: string;
  status?: string;
  severity?: string;
  isChronicNcd?: boolean;
  onsetDate?: string;
  clinicalNotes?: string;
  recordedByDoctorName?: string;
}

export interface PatientAllergyRecord {
  id: string;
  clinicId: string;
  patientId: string;
  category: 'Medication' | 'Food' | 'Environmental' | 'Biologic' | 'Other';
  allergen: string;
  allergenDrugCode?: string;
  severity: 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';
  reactionManifestation?: string;
  isAnaphylactic: boolean;
  status: 'Active' | 'Inactive' | 'Refuted';
  onsetDate?: string;
  notes?: string;
  createdAt: string;
}

export interface CreatePatientAllergyPayload {
  category?: string;
  allergen: string;
  allergenDrugCode?: string;
  severity?: string;
  reactionManifestation?: string;
  isAnaphylactic?: boolean;
  onsetDate?: string;
  notes?: string;
}

export interface PatientSurgicalHistory {
  id: string;
  clinicId: string;
  patientId: string;
  procedureName: string;
  surgeryDate: string;
  hospitalName?: string;
  findings?: string;
  complications?: string;
  remarks?: string;
  createdAt: string;
}

export interface UpsertPatientSurgicalHistoryPayload {
  procedureName: string;
  surgeryDate: string;
  hospitalName?: string;
  findings?: string;
  complications?: string;
  remarks?: string;
}

export interface PatientPastMedicalHistory {
  id: string;
  patientId: string;
  conditionTitle: string;
  philHealthMdiseaseCode?: string | null;
  icd10Code?: string | null;
  specificDescription?: string | null;
  diagnosisDate?: string | null;
  isResolved: boolean;
  clinicalNotes?: string | null;
  createdAt: string;
}

export interface PatientMedicalHistoryResponse {
  items: PatientPastMedicalHistory[];
  personalMedicalHistoryNotes?: string | null;
  updatedAt?: string | null;
}

export interface MedicalHistoryEntryItem {
  conditionTitle: string;
  philHealthMdiseaseCode?: string | null;
  icd10Code?: string | null;
  specificDescription?: string | null;
  diagnosisDate?: string | null;
  isResolved?: boolean;
  clinicalNotes?: string | null;
}

export interface SavePatientMedicalHistoriesPayload {
  items: MedicalHistoryEntryItem[];
  notes?: string | null;
}

export interface PatientFamilyHistory {
  id: string;
  patientId: string;
  conditionTitle: string;
  philHealthMdiseaseCode?: string | null;
  icd10Code?: string | null;
  specificDescription?: string | null;
  relationship?: string | null;
  clinicalNotes?: string | null;
  createdAt: string;
}

export interface PatientFamilyHistoryResponse {
  items: PatientFamilyHistory[];
  familyMedicalHistoryNotes?: string | null;
  updatedAt?: string | null;
}

export interface FamilyHistoryEntryItem {
  conditionTitle: string;
  philHealthMdiseaseCode?: string | null;
  icd10Code?: string | null;
  specificDescription?: string | null;
  relationship?: string | null;
  clinicalNotes?: string | null;
}

export interface SavePatientFamilyHistoriesPayload {
  items: FamilyHistoryEntryItem[];
  notes?: string | null;
}

export interface PatientSocialHistory {
  id: string;
  clinicId: string;
  patientId: string;
  isSmoker: boolean;
  smokingStatus?: 'never' | 'current' | 'quit' | string;
  packsPerDay?: number;
  cigarettesPerDay?: number;
  yearsSmoking?: number;
  smokingPackYears?: number;
  smokingStoppedDate?: string;
  isAlcoholDrinker: boolean;
  alcoholStatus?: 'never' | 'current' | 'quit' | string;
  alcoholDrinksPerWeek?: number;
  alcoholBottlesPerDay?: number;
  alcoholFrequency?: string;
  usesIllicitDrugs: boolean;
  substanceUseHistory?: string;
  drugTypes?: string;
  isSexuallyActive: boolean;
  coitarcheAge?: number;
  physicalActivityFrequency?: string;
  dietaryHabits?: string;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UpdatePatientSocialHistoryPayload {
  isSmoker: boolean;
  smokingStatus?: 'never' | 'current' | 'quit' | string;
  packsPerDay?: number;
  cigarettesPerDay?: number;
  yearsSmoking?: number;
  smokingPackYears?: number;
  smokingStoppedDate?: string;
  isAlcoholDrinker: boolean;
  alcoholStatus?: 'never' | 'current' | 'quit' | string;
  alcoholDrinksPerWeek?: number;
  alcoholBottlesPerDay?: number;
  alcoholFrequency?: string;
  usesIllicitDrugs: boolean;
  substanceUseHistory?: string;
  drugTypes?: string;
  isSexuallyActive: boolean;
  coitarcheAge?: number;
  physicalActivityFrequency?: string;
  dietaryHabits?: string;
  remarks?: string;
}

export interface PatientReproductiveHistory {
  id: string;
  clinicId: string;
  patientId: string;
  isApplicable: boolean;
  menarcheAge?: number;
  lastMenstrualPeriod?: string;
  periodDurationDays?: number;
  cycleIntervalDays?: number;
  padsPerDay?: number;
  isMenopausal: boolean;
  menopauseAge?: number;
  contraceptiveMethod?: string;
  gravidity?: number;
  parity?: number;
  termBirths?: number;
  pretermBirths?: number;
  abortions?: number;
  livingChildren?: number;
  deliveryType?: string;
  hadPreEclampsiaHypertension: boolean;
  receivedFamilyPlanningCounseling: boolean;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UpdatePatientReproductiveHistoryPayload {
  isApplicable: boolean;
  menarcheAge?: number;
  lastMenstrualPeriod?: string;
  periodDurationDays?: number;
  cycleIntervalDays?: number;
  padsPerDay?: number;
  isMenopausal: boolean;
  menopauseAge?: number;
  contraceptiveMethod?: string;
  gravidity?: number;
  parity?: number;
  termBirths?: number;
  pretermBirths?: number;
  abortions?: number;
  livingChildren?: number;
  deliveryType?: string;
  hadPreEclampsiaHypertension: boolean;
  receivedFamilyPlanningCounseling: boolean;
  remarks?: string;
}

export interface PatientPhysicalExamProfile {
  id: string;
  patientId: string;
  genSurveyId: string;
  genSurveyRemarks?: string | null;
  skinId: string;
  skinRemarks?: string | null;
  heentId: string;
  heentRemarks?: string | null;
  chestId: string;
  chestRemarks?: string | null;
  heartId: string;
  heartRemarks?: string | null;
  abdomenId: string;
  abdomenRemarks?: string | null;
  neuroId: string;
  neuroRemarks?: string | null;
  rectalId: string;
  rectalRemarks?: string | null;
  guId: string;
  guRemarks?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export type UpdatePatientPhysicalExamPayload = Partial<
  Omit<PatientPhysicalExamProfile, 'id' | 'patientId' | 'createdAt' | 'updatedAt'>
>;

export interface NcdRiskAssessment {
  id: string;
  clinicId: string;
  patientId: string;
  consultationEncounterId?: string;
  assessmentDate?: string;
  assessedByStaffId?: string;
  assessedByStaffName?: string;
  eatsProcessedFoodWeekly?: boolean;
  threeServingsVegetablesDaily?: boolean;
  twoToThreeServingsFruitDaily?: boolean;
  physicalActivityAtLeast150MinsWeekly?: boolean | null;
  diagnosedDiabetes?: string | boolean | null;
  hasPolyphagia?: boolean | null;
  hasPolydipsia?: boolean | null;
  hasPolyuria?: boolean | null;
  diabetesMedicationStatus?: string | null;
  hasRaisedBloodGlucose?: boolean | null;
  fastingBloodSugarMgDl?: number | null;
  fastingBloodSugarMmolL?: number | null;
  fastingBloodSugarDate?: string | null;
  hasChestPain?: boolean | null;
  painInCenterOfChestOrLeftArm?: boolean | null;
  painWhenWalkingUphill?: boolean | null;
  slowsDownWhenPainOccurs?: boolean | null;
  painRelievedWithin10Mins?: boolean | null;
  painRelievedByNitrates?: boolean | null;
  severeChestPainOver30Mins?: boolean | null;
  transientNeurologicalDeficits?: boolean | null;
  hasRaisedBloodLipids?: boolean | null;
  totalCholesterolMgDl?: number | null;
  totalCholesterolDate?: string | null;
  hasHistoryAnginaHeartAttack?: boolean | null;
  hasHistoryStrokeOrTia?: boolean | null;
  urineKetonesPresent?: boolean | null;
  urineKetonesValue?: string | null;
  urineKetonesDate?: string | null;
  urineProteinPresent?: boolean | null;
  urineProteinValue?: string | null;
  urineProteinDate?: string | null;
  riskBand: 'BandA' | 'BandB' | 'BandC' | 'BandD' | 'BandE';
  calculatedRiskScorePercent?: number | null;
  remarks?: string | null;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  voidReason?: string;
}

export interface SaveNcdRiskAssessmentPayload {
  consultationEncounterId?: string | null;
  assessmentDate?: string | null;
  assessedByStaffId?: string | null;
  assessedByStaffName?: string | null;
  eatsProcessedFoodWeekly?: boolean | null;
  threeServingsVegetablesDaily?: boolean | null;
  twoToThreeServingsFruitDaily?: boolean | null;
  physicalActivityAtLeast150MinsWeekly?: boolean | null;
  diagnosedDiabetes?: string | boolean | null;
  hasPolyphagia?: boolean | null;
  hasPolydipsia?: boolean | null;
  hasPolyuria?: boolean | null;
  diabetesMedicationStatus?: string | null;
  hasRaisedBloodGlucose?: boolean | null;
  fastingBloodSugarMgDl?: number | null;
  fastingBloodSugarMmolL?: number | null;
  fastingBloodSugarDate?: string | null;
  hasChestPain?: boolean | null;
  painInCenterOfChestOrLeftArm?: boolean | null;
  painWhenWalkingUphill?: boolean | null;
  slowsDownWhenPainOccurs?: boolean | null;
  painRelievedWithin10Mins?: boolean | null;
  painRelievedByNitrates?: boolean | null;
  severeChestPainOver30Mins?: boolean | null;
  transientNeurologicalDeficits?: boolean | null;
  hasRaisedBloodLipids?: boolean | null;
  totalCholesterolMgDl?: number | null;
  totalCholesterolDate?: string | null;
  hasHistoryAnginaHeartAttack?: boolean | null;
  hasHistoryStrokeOrTia?: boolean | null;
  urineKetonesPresent?: boolean | null;
  urineKetonesValue?: string | null;
  urineKetonesDate?: string | null;
  urineProteinPresent?: boolean | null;
  urineProteinValue?: string | null;
  urineProteinDate?: string | null;
  riskBand?: string;
  calculatedRiskScorePercent?: number | null;
  remarks?: string | null;
}

export interface PediatricZScoreResult {
  ageInMonths: number;
  adjustedLengthHeightCm: number;
  weightForAgeZScore?: number;
  heightForAgeZScore?: number;
  weightForHeightZScore?: number;
  philHealthZScoreCategory?: string;
  philHealthZScoreCode?: string;
  interpretation?: string;
}

export interface CalculatePediatricZScorePayload {
  dateOfBirth: string;
  sex: string;
  lengthOrHeightCm: number;
  weightKg: number;
  isMeasuredRecumbent?: boolean;
  assessmentDate?: string;
}

export interface PatientDemographics {
  dob?: string;
  dateOfBirth?: string;
  age: number;
  sex: string;
  genderIdentity?: string | null;
  civilStatus?: string | null;
  contactNumber: string;
  email?: string | null;
  addressLine?: string | null;
  barangay?: string | null;
  city?: string | null;
  province?: string | null;
  philHealthNumber?: string | null;
  seniorCitizenId?: string | null;
  pwdId?: string | null;
  bloodType?: string | null;
  memberStatus?: string | null;
  philHealthAtc?: string | null;
  atc?: string | null;
  activeCaseNo?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  alerts?: string | null;
  patientCode?: string | null;
  clinicEzId?: string | null;
  verificationStatus?: string;
  isSenior?: boolean;
  isPwd?: boolean;
  hasActiveCaseNo?: boolean;
  patientName?: string;
}

export interface PatientImmunizationRecord {
  id: string;
  patientId: string;
  patientName: string;
  consultationEncounterId?: string | null;
  philHealthLibrary: string; // 'lib_immchild' | 'lib_immyoungw' | 'lib_immpregw' | 'lib_immelderly' | 'OtherImm'
  philHealthCode: string;
  vaccineName: string;
  brandName?: string | null;
  manufacturer?: string | null;
  lotBatchNumber: string;
  expirationDate: string; // 'YYYY-MM-DD'
  doseSequence: number;
  isSeriesCompleted: boolean;
  route: string;
  injectionSite?: string | null;
  administeredAtUtc: string; // ISO
  administeredByStaffId: string;
  administeredByStaffName: string;
  administeredByPrcLicense?: string | null;
  hasAdverseReaction: boolean;
  adverseReactionSeverity: string;
  adverseReactionRemarks?: string | null;
  adverseReactionRecordedAtUtc?: string | null;
  isHistorical: boolean;
  historicalFacilityName?: string | null;
  remarks?: string | null;
  isSynchronizedToPatientApp: boolean;
  synchronizedAtUtc?: string | null;
}

export interface AdministerVaccinePayload {
  consultationEncounterId?: string | null;
  philHealthLibrary: string;
  philHealthCode: string;
  vaccineName: string;
  brandName?: string | null;
  manufacturer?: string | null;
  lotBatchNumber: string;
  expirationDate: string; // 'YYYY-MM-DD'
  doseSequence: number;
  isSeriesCompleted: boolean;
  route: string;
  injectionSite?: string | null;
  administeredAtUtc: string; // ISO
  administeredByStaffId: string;
  administeredByStaffName: string;
  administeredByPrcLicense?: string | null;
  remarks?: string | null;
  queueItemId?: string | null;
  completeVisit?: boolean;
}

export interface RecordHistoricalImmunizationPayload {
  philHealthLibrary: string;
  philHealthCode: string;
  vaccineName: string;
  administeredDate: string; // 'YYYY-MM-DD'
  doseSequence: number;
  isSeriesCompleted: boolean;
  lotBatchNumber?: string | null;
  historicalFacilityName?: string | null;
  route?: string | null;
  injectionSite?: string | null;
  remarks?: string | null;
}

export interface RecordAefiPayload {
  adverseReactionSeverity: 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';
  adverseReactionRemarks: string;
  recordedAtUtc: string; // ISO
}

export interface PatientChart {
  patientId: string;
  patientName: string;
  totalVisits: number;
  demographics?: PatientDemographics;
  consultations: ConsultationRecord[];
  vitalsHistory: TriageVitals[];
  proceduresHistory: ClinicalProcedureRecord[];
  labOrdersHistory: ClinicLabOrderRecord[];
  invoicesHistory: InvoiceRecord[];
  problems?: PatientProblemRecord[];
  allergies?: PatientAllergyRecord[];
  immunizations?: PatientImmunizationRecord[];
  attachments?: ClinicRecordAttachmentRecord[];
  surgicalHistories?: PatientSurgicalHistory[];
  pastMedicalHistories?: PatientPastMedicalHistory[];
  familyHistories?: PatientFamilyHistory[];
  personalMedicalHistoryNotes?: string;
  familyMedicalHistoryNotes?: string;
  socialHistory?: PatientSocialHistory;
  reproductiveHistory?: PatientReproductiveHistory;
  latestNcdAssessment?: NcdRiskAssessment;
  dentalChart?: DentalChart | null;
  dentalTeeth?: DentalToothRecord[];
  dentalProcedures?: ClinicalProcedureRecord[];
  medicalCertificates?: MedicalCertificateRecord[];
  referralLetters?: ReferralLetterRecord[];
  addresses?: PatientAddressDto[];
  guardians?: PatientGuardianDto[];
}

export type ToothStatus =
  | 'Healthy'
  | 'Decayed'
  | 'Filled'
  | 'Missing'
  | 'Crowned'
  | 'ForExtraction'
  | 'Sealant'
  | 'Fractured'
  | 'Impacted'
  | 'RootCanal'
  | 'Implant';

export interface DentalToothRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  patientId: string;
  patientName?: string | null;
  consultationId?: string | null;
  toothNumber: number;
  status: ToothStatus;
  surface?: string | null;
  activeSurface?: string | null;
  isCurrent?: boolean;
  isCurrentEncounter?: boolean;
  supersededAt?: string | null;
  supersededByRecordId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  recordedBy?: string | null;
  isVoided?: boolean;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
}

export interface DentalSummary {
  totalTeethRecorded: number;
  healthyCount: number;
  decayCount: number;
  filledCount: number;
  missingCount: number;
  crownCount: number;
  extractionCount: number;
}

export interface DentalChart {
  patientId: string;
  teeth: DentalToothRecord[];
  dentalProcedures: ClinicalProcedureRecord[];
  lastExaminedAt?: string | null;
  summary?: DentalSummary | null;
}

export interface UpsertDentalToothRecordPayload {
  toothNumber: number;
  status: ToothStatus;
  surface?: string | null;
  notes?: string | null;
  consultationId?: string | null;
  removeCondition?: boolean;
  conditionId?: string | null;
  recordedBy?: string | null;
}

export interface BatchSaveDentalChartPayload {
  consultationId?: string | null;
  teeth: {
    toothNumber: number;
    status: ToothStatus;
    surface?: string | null;
    notes?: string | null;
    removeCondition?: boolean;
    conditionId?: string | null;
    recordedBy?: string | null;
  }[];
}

export interface PatientDirectoryCounts {
  all: number;
  students: number;
  employees: number;
  alerts: number;
  seniorPwd: number;
  myPatients?: number;
}


export interface PatientActiveQueueTicket {
  id: string;
  queueNumber: string;
  status: QueueStatus | string;
  visitType: VisitType | string;
  chiefComplaint?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  checkInTime?: string;
  isDirectVisit?: boolean;
  roomId?: string | null;
}

export interface ClinicPatient {
  id: string;
  tenantId: string;
  clinicId: string;
  patientCode: string;
  clinicEzId?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  fullName: string;
  dateOfBirth: string;
  age: number;
  sex: string;
  genderIdentity?: string | null;
  civilStatus?: string;
  contactNumber: string;
  email?: string;
  addressLine?: string;
  barangay?: string;
  city?: string;
  province?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  philHealthNumber?: string;
  seniorCitizenId?: string;
  pwdId?: string;
  bloodType?: string;
  allergies?: string;
  chronicConditions?: string;
  personalMedicalHistoryNotes?: string;
  familyMedicalHistoryNotes?: string;
  alerts?: string;
  syncPatientId?: string;
  customFields?: Record<string, any>;
  verificationStatus?: string;
  createdAt: string;
  activeQueueTicket?: string | null;
  activeQueueItemId?: string | null;
  activeQueueTickets?: PatientActiveQueueTicket[] | null;
  pastMedicalHistories?: MedicalHistoryItemPayload[];
  structuredAllergies?: PatientAllergyRecord[];
  addresses?: PatientAddressDto[];
  guardians?: PatientGuardianDto[];
  regionPsgc?: string | null;
  provincePsgc?: string | null;
  cityMunicipalityPsgc?: string | null;
  barangayPsgc?: string | null;
  zipCode?: string | null;
}

export interface DuplicateMatch {
  patientId: string;
  patientCode: string;
  fullName: string;
  dateOfBirth: string;
  contactNumber?: string | null;
  philHealthNumber?: string | null;
  matchReason: string;
  similarityScore?: number | null;
  confidence?: 'High' | 'Medium' | 'Low' | null;
}

export interface DuplicatePatientCheckResult {
  hasDuplicates: boolean;
  matches: DuplicateMatch[];
}

export interface CheckPatientDuplicatesParams {
  philHealthNumber?: string;
  contactNumber?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

export interface CreateAllergyPayload {
  category: 'Medication' | 'Food' | 'Environmental' | 'Biologic' | 'Other';
  allergen: string;
  allergenDrugCode?: string | null;
  severity: 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';
  reactionManifestation?: string | null;
  isAnaphylactic: boolean;
  onsetDate?: string | null;
  notes?: string | null;
}

export interface MedicalHistoryItemPayload {
  id?: string;
  conditionTitle: string;
  philHealthMdiseaseCode?: string | null;
  icd10Code?: string | null;
  specificDescription?: string | null;
  onsetDate?: string | null;
  isResolved?: boolean;
  clinicalNotes?: string | null;
}

export interface RegisterPatientPayload {
  patientCode?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  dateOfBirth: string;
  sex: string;
  genderIdentity?: string | null;
  civilStatus?: string;
  contactNumber: string;
  email?: string;
  addressLine?: string;
  barangay?: string;
  city?: string;
  province?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  philHealthNumber?: string;
  seniorCitizenId?: string;
  pwdId?: string;
  bloodType?: string;
  allergies?: string;
  chronicConditions?: string;
  alerts?: string;
  customFields?: Record<string, any>;
  verificationStatus?: string;
  structuredAllergies?: CreateAllergyPayload[];
  medicalHistories?: MedicalHistoryItemPayload[];
  addresses?: PatientAddressDto[];
  guardians?: PatientGuardianDto[];
  regionPsgc?: string | null;
  provincePsgc?: string | null;
  cityMunicipalityPsgc?: string | null;
  barangayPsgc?: string | null;
  zipCode?: string | null;
  sendToTriage?: boolean;
  seriesPrefix?: string;
  priority?: 'Routine' | 'Urgent' | 'Emergency' | 'Normal';
  chiefComplaint?: string;
  doctorId?: string;
  doctorName?: string;
  roomId?: string;
  roomOrStation?: string;
  queueDate?: string;
}

export interface VisibilityRule {
  source: 'custom_field' | 'static';
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'contains' | 'not_empty';
  value?: any;
}

export interface ConditionalOptionsConfig {
  parentField: string;
  mapping: Record<string, string[]>;
  defaultOptions?: string[];
}

export type BoundaryMode = 'pastOrToday' | 'futureOrToday' | 'futureOnly' | 'any';

export interface ClinicCustomFieldDefinition {
  id: string;
  tenantId: string;
  clinicId: string;
  entityType: string;
  fieldKey: string;
  label: string;
  dataType: 'Text' | 'Number' | 'Date' | 'Select' | 'Boolean';
  category?: string;
  isRequired: boolean;
  displayOrder: number;
  optionsJson?: string;
  placeholder?: string;
  isActive: boolean;
  createdAt?: string;
  visibilityRuleJson?: string;
  conditionalOptionsJson?: string;
  boundaryMode?: BoundaryMode | null;
}

export interface MedicalCertificateRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  certificateNumber: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
  queueItemId?: string;
  doctorId: string;
  doctorName: string;
  prcLicenseNumber: string;
  ptrNumber?: string;
  issueDate: string;
  diagnosis: string;
  clinicalFindings?: string;
  fitnessStatus: string;
  recommendedRestDays?: number;
  restStartDate?: string;
  restEndDate?: string;
  purpose: string;
  remarks?: string;
  isSigned: boolean;
  signedAt?: string;
  securityDigest?: string;
  createdAt: string;
}

export interface ReferralLetterRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  referralNumber: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
  queueItemId?: string;
  referringDoctorId: string;
  referringDoctorName: string;
  referredToDoctor?: string;
  referredToFacility: string;
  referredDepartment: string;
  referralDate: string;
  urgency: string;
  reasonForReferral: string;
  provisionalDiagnosis: string;
  clinicalSummary: string;
  currentMedications?: string;
  attachedDiagnostics?: string;
  isSigned: boolean;
  signedAt?: string;
  securityDigest?: string;
  createdAt: string;
}

export interface ClinicRecordAttachmentRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  patientId: string;
  consultationId?: string;
  recordType: string;
  title: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  storageUri: string;
  documentDate: string;
  notes?: string;
  uploadedByStaffId?: string;
  uploadedByStaffName?: string;
  verificationStatus?: string;
  rejectionReason?: string;
  verifiedAt?: string;
  verifiedByStaffId?: string;
  verifiedByStaffName?: string;
  encryptionAlgorithm?: string;
  encryptionKeyId?: string;
  encryptedSizeBytes?: number;
  encryptedHash?: string;
  createdAt: string;
}

export interface ClinicPublishingChecks {
  hasOperatingHours: boolean;
  hasLicensedDoctors: boolean;
  hasActiveServices: boolean;
  hasLetterhead: boolean;
}

export interface ClinicPublishingReadiness {
  isReady: boolean;
  isWorkspaceEligible?: boolean;
  checks: ClinicPublishingChecks;
  licensedDoctorsCount: number;
  activeServicesCount: number;
  operatingHours?: string | null;
}

export interface ClinicPublishingResult {
  success: boolean;
  isPublished: boolean;
  message: string;
}

export interface ClinicBookingPauseResult {
  success: boolean;
  isPaused: boolean;
  message: string;
}

export interface ClinicSettingsRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  clinicName: string;
  taxIdentificationNumber?: string;
  accreditationNumber?: string;
  operatingHours: string;
  defaultSlotDurationMinutes: number;
  queuePrefix: string;
  invoicePrefix: string;
  defaultConsultationFee: number;
  vatRate: number;
  letterheadHeader?: string;
  letterheadSubHeader?: string;
  letterheadAddress?: string;
  letterheadContact?: string;
  letterheadFooter?: string;
  letterheadAccentColorHex?: string | null;
  documentAccentColorHex?: string | null;
  letterheadDohLto?: string;
  dohLicenseToOperate?: string;
  paperSize?: 'Letter' | 'A4' | 'A5';
  preferredChartLayout?: 'modal' | 'split' | 'drawer';
  isJoinEnabled?: boolean;
  joinCode?: string | null;
  joinCodeExpiresAt?: string | null;
  clearJoinCode?: boolean;
  clearJoinCodeExpiresAt?: boolean;

  cashierMode?: 'ClinicDesk' | 'CashierCounter';

  // Milestone 2 Directory Publishing & Dynamic Booking Capacity
  isDirectoryPublished?: boolean;
  isOnlineBookingPaused?: boolean;
  isWorkspaceEligible?: boolean;

  patientSearchDisplayFieldsJson?: string | null;
  eodReconciliationTime?: string | null;
  autoEodEnabled?: boolean;
  tvDisplayMaskPatientNames?: boolean;
  enableQueuePushNotifications?: boolean;
  queuePushNotificationThreshold?: number;
  enableChipLevelQueueCalling?: boolean;
  staffNotificationRetentionDays?: number;
  enableStatAudioAlert?: boolean;
  enableStatVibrationAlert?: boolean;
  tenantSlug?: string;
  facilitySlug?: string;
  tvDisplayPin?: string | null;
  clearTvDisplayPin?: boolean;
  tvDisplaySoundTheme?: 'classicChime' | 'doorbell' | 'marimba' | 'bell' | 'elevator' | 'silent' | string;
  tvDisplayVoiceEnabled?: boolean;
  tvDisplayShowPhysicianName?: boolean;
  primaryLogoUrl?: string | null;
  primaryColorHex?: string;
  specialtyMode?: 'Medical' | 'Dental' | 'Multi-Specialty' | 'MultiSpecialty';
  enableDentalModule?: boolean;

  defaultApproverName?: string | null;
  defaultApproverTitle?: string | null;
  documentSignatoriesJson?: string | null;

  // Milestone 5 Calendar Appointment Reminders & Push Notification Settings
  enableAppointmentReminders?: boolean;
  appointmentReminder24hEnabled?: boolean;
  appointmentReminder2hEnabled?: boolean;
  enableStaffAppointmentNotifications?: boolean;

  // Regional Timezone, Date & Time Format Overrides (null/undefined = inherit from WorkspaceProfile)
  timeZoneId?: string | null;
  dateFormat?: string | null;
  timeFormat?: '12h' | '24h' | string | null;

  // Branch Baseline & Explicit PhilHealth Override (Milestone 2 Issue #70)
  pmccNumber?: string | null;
  softwareCertificateId?: string | null;
  konsultaEndpoint?: string | null;
  isPhilHealthConfigured?: boolean;
  isPhilHealthOverridden?: boolean;
  branchId?: string | null;
  branchName?: string | null;
  branchPhilHealthAccreditationNumber?: string | null;
  branchPmccNumber?: string | null;
  branchSoftwareCertificateId?: string | null;
  branchKonsultaEndpoint?: string | null;
  isBranchPhilHealthAccredited?: boolean;

  // Teleconsultation Settings (Milestone 1 & Milestone 5)
  teleconsultRecordingPolicy?: TeleconsultRecordingPolicy | string;
  teleconsultRecordingRetentionDays?: number;
  teleconsultRecordingConsentRequired?: boolean;
  teleconsultPaymentPolicy?: TeleconsultPaymentPolicy | string;
  teleconsultDefaultFee?: number | null;
}

export interface DocumentSignatoryItemConfig {
  preparedByTitle?: string | null;
  approverName?: string | null;
  approverTitle?: string | null;
}

export type NotificationUrgency = 'Routine' | 'Urgent' | 'Stat';
export type StaffNotificationCategory = 'LabResult' | 'Queue' | 'ClinicalAlert' | 'System' | 'Appointment';

export interface ClinicStaffNotification {
  id: string;
  clinicId: string;
  recipientStaffId?: string | null;
  recipientRole?: string | null;
  title: string;
  body: string;
  category: StaffNotificationCategory;
  urgency: NotificationUrgency;
  actionRoute?: string | null;
  actionParamsJson?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface StaffNotificationListResponse {
  items: ClinicStaffNotification[];
  unreadCount: number;
  hasStatAlert: boolean;
}

export interface WorkspaceProfile {
  tenantSlug: string;
  version?: number;
  displayName: string;
  logoUrl?: string | null;
  accentColorHex?: string | null;
  timeZoneId?: string;
  locale?: string;
  dateFormat?: string;
  currencyCode?: string;
  dpoName?: string | null;
  dpoEmail?: string | null;
  privacyNoticeUrl?: string | null;
}

export interface ReconcileEodResult {
  reconciledCount: number;
  reconciliationDate: string;
  reconciledAt: string;
  affectedTicketNumbers: string[];
  summary: string;
}

export interface CheckInRequest {
  patientId: string;
  patientName?: string;
  appointmentId?: string;
  doctorId?: string;
  assignedDoctorId?: string;
  doctorName?: string;
  assignedDoctorName?: string;
  priority?: QueuePriority;
  chiefComplaint?: string;
  roomOrStation?: string;
  roomId?: string;
  queueDate?: string;
  visitType?: VisitType | string;
  seriesPrefix?: string;
  allowDuplicateActive?: boolean;
}

export interface RecordTriageRequest {
  nurseId?: string;
  recordedByNurseName?: string;
  systolicBp?: number;
  diastolicBp?: number;
  heartRateBpm?: number;
  temperatureCelsius?: number;
  respiratoryRateBreathsPerMin?: number;
  oxygenSaturationPercent?: number;
  heightCm?: number;
  weightKg?: number;
  painScore?: number;
  notes?: string;
  visualAcuityLeft?: string;
  visualAcuityRight?: string;
  headCircumferenceCm?: number;
  midUpperArmCircumferenceCm?: number;
  isMeasuredRecumbent?: boolean;
  zScoreWeightForAge?: number;
  zScoreLengthForAge?: number;
  zScoreWeightForLength?: number;
  philHealthZScoreCategory?: string;
  philHealthZScoreCode?: string;
  growthZScoreCategory?: string;
  growthZScoreCode?: string;
  waistCircumferenceCm?: number;
  hipCircumferenceCm?: number;
  bodyLengthCm?: number;
  skinfoldThicknessMm?: number;
  limbsCircumferenceCm?: number;
  preAssessmentNotes?: string;
  preAssessmentRemarks?: string;
  triageAcuityReason?: string;
  priority?: QueuePriority;
  homeInstructions?: string;
  rosCategory?: RosCategoryCode | string;
  chiefComplaint?: string;
  dispensedItems?: TriageDispensedItemInput[];
}

export interface UpdateTriageRequest {
  nurseId?: string;
  recordedByNurseName?: string;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRateBpm?: number | null;
  temperatureCelsius?: number | null;
  respiratoryRateBreathsPerMin?: number | null;
  oxygenSaturationPercent?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  painScore?: number | null;
  notes?: string | null;
  visualAcuityLeft?: string | null;
  visualAcuityRight?: string | null;
  headCircumferenceCm?: number | null;
  midUpperArmCircumferenceCm?: number | null;
  isMeasuredRecumbent?: boolean | null;
  zScoreWeightForAge?: number | null;
  zScoreLengthForAge?: number | null;
  zScoreWeightForLength?: number | null;
  philHealthZScoreCategory?: string | null;
  philHealthZScoreCode?: string | null;
  growthZScoreCategory?: string | null;
  growthZScoreCode?: string | null;
  waistCircumferenceCm?: number | null;
  hipCircumferenceCm?: number | null;
  bodyLengthCm?: number | null;
  skinfoldThicknessMm?: number | null;
  limbsCircumferenceCm?: number | null;
  preAssessmentNotes?: string | null;
  preAssessmentRemarks?: string | null;
  triageAcuityReason?: string | null;
  priority?: QueuePriority;
  clearHeight?: boolean;
  clearWeight?: boolean;
  homeInstructions?: string | null;
  rosCategory?: RosCategoryCode | string | null;
  chiefComplaint?: string | null;
  dispensedItems?: TriageDispensedItemInput[];
}

export interface CreateConsultationRequest {
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  queueItemId?: string;
  appointmentId?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  homeInstructions?: string;
  rosCategory?: RosCategoryCode | string;
  diagnoses?: Array<{ icd10Code: string; description: string; isPrimary?: boolean }>;
  prescriptions?: Array<{
    genericName: string;
    brandName?: string;
    dosage: string;
    form: string;
    sig: string;
    quantity: number;
    durationDays?: number;
    refills?: number;
    isDangerousDrug?: boolean;
    remarks?: string;
    philHealthDrugCode?: string;
    clinicDispensedQuantity?: number;
    rosCategory?: RosCategoryCode | string;
  }>;
  isYakapEligible?: boolean;
  philHealthSignSympCode?: string;
  philHealthOtherComplaint?: string;
  philHealthPainSite?: string;
  doctorPhilHealthPan?: string;
  philHealthAtc?: string;
  hciCaseNo?: string;
  hciTransNo?: string;
  soapTransNo?: string;
  generalSurveyId?: string;
  generalSurveyRemarks?: string;
  physicalExamFindingsJson?: string;
  visitWorkflowMode?: VisitWorkflowMode;
  physicalExams?: PatientPhysicalExamDto[];
  reviewOfSystemsItems?: EncounterReviewOfSystemsItemDto[];
  obGyneExam?: EncounterObGyneExamDto | null;
  pediatricMilestones?: EncounterPediatricMilestoneDto[];
  adolescentAssessment?: EncounterAdolescentAssessmentDto | null;
  headsssAssessments?: EncounterHeadsssDomainAssessmentDto[];
  bpMonitoringLogs?: PatientBpMonitoringLogDto[];
  counselingCodes?: string | null;
  routineVaccineName?: string | null;
  routineVaccineDate?: string | null;
  adultsRoutineScreeningCode?: string | null;
  pediatricRoutineScreeningCode?: string | null;
  prenatalScreeningServicesCode?: string | null;
  cancerScreeningCodes?: string | null;
  diagnosticServicesOption?: string | null;
  hasMedicationPrescription?: boolean;
  hasReferral?: boolean;
  otherMedicalAdviceSpec?: string | null;
  hasFollowUp?: boolean;
  followUpDate?: string | null;
  followUpScheduleText?: string | null;
  followUpReason?: string | null;
  followUpVaccineName?: string | null;
  followUpVaccineNextDate?: string | null;
  doctorPrcLicense?: string;
  doctorPtr?: string;
  doctorS2License?: string;
  draftDiagnosticOrders?: DraftDiagnosticOrderDto[] | null;
  draftProcedures?: DraftProcedureOrderDto[] | null;
  draftDentalTeeth?: DraftDentalToothDto[] | null;
  draftWorkspace?: ConsultationDraftWorkspaceDto | null;
}

export interface CreateInvoiceRequest {
  patientId?: string;
  patientName?: string;
  isWalkInRetail?: boolean;
  walkInCustomerName?: string;
  visitType?: VisitType;
  queueItemId?: string;
  appointmentId?: string;
  consultationId?: string;
  attendingDoctorId?: string;
  attendingDoctorName?: string;
  discountType: DiscountType;
  discountIdNumber?: string;
  customDiscountPercentage?: number;
  notes?: string;
  allowDuplicate?: boolean;
  lineItems: Array<{
    serviceItemId?: string;
    itemCode?: string;
    description: string;
    category: string;
    unitPrice: number;
    quantity: number;
    doctorId?: string;
    doctorName?: string;
  }>;
}

export interface RecordPaymentRequest {
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
}

export interface UpdateInvoiceRequest {
  discountType?: DiscountType;
  discountIdNumber?: string;
  customDiscountPercentage?: number;
  notes?: string;
  lineItems?: Array<{
    serviceItemId?: string;
    itemCode?: string;
    description: string;
    category: string;
    unitPrice: number;
    quantity: number;
    doctorId?: string;
    doctorName?: string;
  }>;
}

export interface PatientSeedResult {
  patientsCreated: number;
  encountersCreated: number;
  prescriptionsCreated: number;
  medicalCertificatesCreated: number;
  pastMedicalHistoriesCreated: number;
  familyHistoriesCreated: number;
  socialHistoriesCreated: number;
  surgicalHistoriesCreated: number;
  reproductiveHistoriesCreated: number;
  physicalExamProfilesCreated: number;
  allergiesCreated: number;
  problemsCreated: number;
  immunizationsCreated: number;
  elapsed: string;
  tenantId: string;
  clinicId: string;
  doctorName: string;
  samplePatientCodes: string[];
}

export interface SeedStatusResult {
  clinicId?: string | null;
  tenantId?: string | null;
  totalPatients: number;
  seededPatients: number;
  totalEncounters: number;
  totalPrescriptions: number;
  totalMedCerts: number;
  medicalHistories: {
    pastMedicalHistories: number;
    familyHistories: number;
    socialHistories: number;
    surgicalHistories: number;
    reproductiveHistories: number;
    allergies: number;
    problems: number;
    immunizations: number;
  };
}

export const clinicService = {
  // Queue & Walk-In Engine
  async getQueue(paramsOrDate?: string | GetQueueParams, status?: QueueStatus) {
    const params = new URLSearchParams();
    if (typeof paramsOrDate === 'string') {
      if (paramsOrDate) params.append('date', paramsOrDate);
      if (status) params.append('status', status);
    } else if (paramsOrDate && typeof paramsOrDate === 'object') {
      if (paramsOrDate.date) params.append('date', paramsOrDate.date);
      if (paramsOrDate.status) params.append('status', paramsOrDate.status);
      if (paramsOrDate.doctorId) params.append('doctorId', paramsOrDate.doctorId);
      if (paramsOrDate.roomOrStation) params.append('roomOrStation', paramsOrDate.roomOrStation);
      if (paramsOrDate.roomId) params.append('roomId', paramsOrDate.roomId);
      if (paramsOrDate.view) params.append('view', paramsOrDate.view);
    }
    const qs = params.toString();
    return clinicApiClient.get<PatientQueueItem[]>(`/queue${qs ? `?${qs}` : ''}`);
  },

  async getQueueMetrics(date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return clinicApiClient.get<QueueMetrics>(`/queue/metrics${qs}`);
  },

  async checkInPatient(payload: CheckInRequest) {
    return clinicApiClient.post<PatientQueueItem>('/queue/check-in', payload);
  },

  async ensureDirectVisit(payload: {
    patientId: string;
    patientName: string;
    doctorId?: string;
    doctorName?: string;
    roomOrStation?: string;
    roomId?: string;
    visitType?: VisitType | string;
    visitWorkflowMode?: 'Regular' | 'YakapAvailment';
    initialStatus?: QueueStatus;
    chiefComplaint?: string;
    queueDate?: string;
    allowDuplicateActive?: boolean;
  }) {
    return clinicApiClient.post<PatientQueueItem>('/queue/direct-visit', payload);
  },

  async callQueueItem(id: string, doctorId?: string, doctorName?: string, roomOrStation?: string, roomId?: string) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/call`, { doctorId, doctorName, roomOrStation, roomId });
  },

  async completeQueueItem(id: string) {
    return clinicApiClient.post<boolean>(`/queue/${id}/complete`);
  },

  async completeNonDoctorVisit(id: string, dischargeRemarks?: string) {
    return clinicApiClient.post<boolean>(`/queue/${id}/discharge-non-doctor`, { dischargeRemarks });
  },

  async divertEmergencyPatient(
    id: string,
    payload: {
      destinationHospital: string;
      transportMode: string;
      paramedicOrEscortName: string;
      clinicalHandoverSummary: string;
    }
  ) {
    return clinicApiClient.post<boolean>(`/queue/${id}/divert`, payload);
  },

  async markNoShow(id: string) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/no-show`);
  },

  async putOnHold(id: string) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/hold`);
  },

  async cancelQueueTicket(id: string, reason?: string) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/cancel`, { reason });
  },

  async reactivateQueueItem(id: string) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/reactivate`);
  },

  async reassignQueueItem(
    id: string,
    payload: { doctorId?: string; doctorName?: string; roomId?: string; roomOrStation?: string }
  ) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/reassign`, payload);
  },

  async reconcileEod(date?: string, reason?: string) {
    return clinicApiClient.post<ReconcileEodResult>('/queue/reconcile-eod', { date, reason });
  },

  // Nurse Triage
  async recordTriage(queueItemId: string, payload: RecordTriageRequest) {
    return clinicApiClient.post<TriageVitals>(`/queue/${queueItemId}/triage`, payload);
  },

  async getTriage(queueItemId: string) {
    return clinicApiClient.get<TriageVitals>(`/queue/${queueItemId}/triage`);
  },

  async updateTriage(queueItemId: string, payload: UpdateTriageRequest) {
    return clinicApiClient.put<TriageVitals>(`/queue/${queueItemId}/triage`, payload);
  },

  async escalateToConsultation(
    queueItemId: string,
    payload?: {
      priority?: QueuePriority;
      escalationReason?: string;
      doctorId?: string;
      doctorName?: string;
      roomId?: string;
      roomOrStation?: string;
    }
  ) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${queueItemId}/escalate-to-consultation`, payload ?? {});
  },

  // Unified Clinic Dispensing Ledger (Doctor Starter Stock + Nurse OTC / Supply)
  async getDispensingLogs(params?: {
    startDate?: string;
    endDate?: string;
    source?: ClinicDispenseSource | string;
    unreviewedOnly?: boolean;
    patientId?: string;
    queueItemId?: string;
    rosCategory?: RosCategoryCode | string;
    search?: string;
  }) {
    const qp = new URLSearchParams();
    if (params?.startDate) qp.append('startDate', params.startDate);
    if (params?.endDate) qp.append('endDate', params.endDate);
    if (params?.source) qp.append('source', params.source);
    if (typeof params?.unreviewedOnly === 'boolean') qp.append('unreviewedOnly', String(params.unreviewedOnly));
    if (params?.patientId) qp.append('patientId', params.patientId);
    if (params?.queueItemId) qp.append('queueItemId', params.queueItemId);
    if (params?.rosCategory) qp.append('rosCategory', params.rosCategory);
    if (params?.search) qp.append('search', params.search);
    const qs = qp.toString();
    return clinicApiClient.get<ClinicDispensingLogRecord[]>(`/dispensing-logs${qs ? `?${qs}` : ''}`);
  },

  async reviewDispensingLog(
    id: string,
    payload?: {
      doctorId?: string;
      doctorName?: string;
      reviewNotes?: string;
      interventionFlagged?: boolean;
    }
  ) {
    return clinicApiClient.post<ClinicDispensingLogRecord>(`/dispensing-logs/${id}/review`, payload ?? {});
  },

  // Appointments
  async getAppointments(
    paramsOrDate?: string | GetAppointmentsOptions,
    status?: AppointmentStatus
  ) {
    const params = new URLSearchParams();
    if (typeof paramsOrDate === 'string') {
      if (paramsOrDate) params.append('date', paramsOrDate);
      if (status) params.append('status', status);
    } else if (paramsOrDate && typeof paramsOrDate === 'object') {
      if (paramsOrDate.date) params.append('date', paramsOrDate.date);
      if (paramsOrDate.startDate) params.append('startDate', paramsOrDate.startDate);
      if (paramsOrDate.endDate) params.append('endDate', paramsOrDate.endDate);
      if (paramsOrDate.doctorId) params.append('doctorId', paramsOrDate.doctorId);
      const effectiveStatus = paramsOrDate.status || status;
      if (effectiveStatus) params.append('status', effectiveStatus);
    } else if (status) {
      params.append('status', status);
    }
    const qs = params.toString();
    return clinicApiClient.get<AppointmentItem[]>(`/appointments${qs ? `?${qs}` : ''}`);
  },

  // Doctor EMR (SOAP Consultations)
  async getConsultations(patientId?: string, doctorId?: string, isSigned?: boolean) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (doctorId) params.append('doctorId', doctorId);
    if (typeof isSigned === 'boolean') params.append('isSigned', String(isSigned));
    const qs = params.toString();
    return clinicApiClient.get<ConsultationRecord[]>(`/consultations${qs ? `?${qs}` : ''}`);
  },

  async getConsultation(id: string) {
    return clinicApiClient.get<ConsultationRecord>(`/consultations/${id}`);
  },

  async createConsultation(payload: CreateConsultationRequest) {
    return clinicApiClient.post<ConsultationRecord>('/consultations', payload);
  },

  async updateConsultation(id: string, payload: Partial<CreateConsultationRequest>) {
    return clinicApiClient.put<ConsultationRecord>(`/consultations/${id}`, payload);
  },

  flushConsultationDraftKeepalive(
    consultationId: string | null | undefined,
    payload: CreateConsultationRequest,
  ): boolean {
    if (consultationId) {
      return clinicApiClient.sendKeepaliveJson('PUT', `/consultations/${consultationId}`, payload);
    }
    return clinicApiClient.sendKeepaliveJson('POST', '/consultations', payload);
  },

  async abandonConsultation(id: string, options?: { reason?: string; cancelVisit?: boolean }) {
    return clinicApiClient.post<boolean>(`/consultations/${id}/abandon`, {
      reason: options?.reason,
      cancelVisit: options?.cancelVisit ?? false,
    });
  },

  async signConsultation(
    id: string,
    credentials?: {
      prcLicenseNumber?: string;
      ptrNumber?: string;
      s2LicenseNumber?: string;
      philHealthPan?: string;
      doctorPhilHealthPan?: string;
      philHealthAtc?: string;
      targetPharmacyFacilityId?: string;
      targetPharmacyTenantId?: string;
    }
  ) {
    const payload = {
      prcLicenseNumber: credentials?.prcLicenseNumber,
      ptrNumber: credentials?.ptrNumber,
      s2LicenseNumber: credentials?.s2LicenseNumber,
      doctorPhilHealthPan: credentials?.doctorPhilHealthPan ?? credentials?.philHealthPan,
      philHealthAtc: credentials?.philHealthAtc,
      targetPharmacyFacilityId: credentials?.targetPharmacyFacilityId,
      targetPharmacyTenantId: credentials?.targetPharmacyTenantId,
    };
    return clinicApiClient.post<ConsultationRecord>(`/consultations/${id}/sign`, payload);
  },

  // PhilHealth Konsulta (Yakap) Statutory Claim Readiness
  async validateConsultationYakapReadiness(consultationId: string) {
    return clinicApiClient.get<YakapClaimReadinessDto>(`/consultations/${consultationId}/yakap-readiness`);
  },

  // E-Prescriptions & Dual-Path Dispense
  async getPrescriptionSlip(consultationId: string) {
    return clinicApiClient.get<PrescriptionSlipData>(`/prescriptions/${consultationId}/slip`);
  },

  /** Drugstores this clinic has recorded external dispenses with, most used first. */
  async getRecentExternalPharmacies() {
    return clinicApiClient.get<string[]>('/prescriptions/external-pharmacies');
  },

  async recordExternalDispense(consultationId: string, payload: RecordExternalDispensePayload) {
    return clinicApiClient.post<PrescriptionSlipData>(`/prescriptions/${consultationId}/record-external-dispense`, payload);
  },

  async getOptionSet(optionSet: string): Promise<EhrOptionDescriptor[]> {
    const { optionsService } = await import('./optionsService');
    return optionsService.getOptionSet(optionSet);
  },

  getPrescriptionSlipPdfUrl(consultationId: string, options?: { wet?: boolean }) {
    const qs = options?.wet !== undefined ? `?wet=${options.wet ? 'true' : 'false'}` : '';
    return clinicApiUrl(`/prescriptions/${consultationId}/slip-pdf${qs}`);
  },

  getPrescriptionSlipPdfByNumberUrl(prescriptionNumber: string, options?: { wet?: boolean }) {
    const qs = options?.wet !== undefined ? `?wet=${options.wet ? 'true' : 'false'}` : '';
    return clinicApiUrl(`/prescriptions/by-number/${encodeURIComponent(prescriptionNumber)}/slip-pdf${qs}`);
  },

  // ICD-10 Search
  async searchIcd10(query?: string) {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    return clinicApiClient.get<Icd10Code[]>(`/icd10${qs}`);
  },

  // Billing & Cashier POS
  async getInvoices(date?: string, patientId?: string, status?: InvoiceStatus) {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (patientId) params.append('patientId', patientId);
    if (status) params.append('status', status);
    const qs = params.toString();
    return clinicApiClient.get<InvoiceRecord[]>(`/billing/invoices${qs ? `?${qs}` : ''}`);
  },

  async createInvoice(payload: CreateInvoiceRequest) {
    return clinicApiClient.post<InvoiceRecord>('/billing/invoices', payload);
  },

  async updateInvoice(invoiceId: string, payload: UpdateInvoiceRequest) {
    return clinicApiClient.put<InvoiceRecord>(`/billing/invoices/${invoiceId}`, payload);
  },

  async recordPayment(invoiceId: string, payload: RecordPaymentRequest) {
    return clinicApiClient.post<InvoiceRecord>(`/billing/invoices/${invoiceId}/pay`, payload);
  },

  getInvoicePdfUrl(invoiceId: string) {
    return clinicApiUrl(`/billing/invoices/${invoiceId}/pdf`);
  },

  getReceiptPdfUrl(invoiceId: string, paymentId?: string) {
    const qs = paymentId ? `?paymentId=${paymentId}` : '';
    return clinicApiUrl(`/billing/invoices/${invoiceId}/receipt-pdf${qs}`);
  },

  async downloadInvoicePreviewPdf(payload: {
    patientId?: string;
    patientName: string;
    queueNumber?: string;
    attendingDoctorName?: string;
    doctorPrcLicense?: string;
    discountType: DiscountType;
    discountIdNumber?: string;
    lineItems: Array<{
      serviceItemId?: string;
      itemCode?: string;
      description: string;
      category: string;
      unitPrice: number;
      quantity: number;
    }>;
    notes?: string;
  }) {
    return clinicApiClient.postBlob<typeof payload>(clinicApiUrl('/billing/invoices/preview-pdf'), payload);
  },

  // Services Catalog & Fee Schedule
  async getServices(category?: string, isActive?: boolean) {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (typeof isActive === 'boolean') params.append('isActive', String(isActive));
    const qs = params.toString();
    return clinicApiClient.get<ClinicServiceItem[]>(`/services${qs ? `?${qs}` : ''}`);
  },

  async createService(payload: {
    code: string;
    name: string;
    category: string;
    standardPrice: number;
    description?: string;
    philHealthCode?: string;
    philHealthDescription?: string;
    isPhilHealthFormulary?: boolean;
  }) {
    return clinicApiClient.post<ClinicServiceItem>('/services', payload);
  },

  async updateService(id: string, payload: {
    name: string;
    category: string;
    standardPrice: number;
    description?: string;
    isActive?: boolean;
    philHealthCode?: string;
    philHealthDescription?: string;
    isPhilHealthFormulary?: boolean;
  }) {
    return clinicApiClient.put<ClinicServiceItem>(`/services/${id}`, payload);
  },

  async bulkImportServices(items: BulkImportServiceItem[]) {
    return clinicApiClient.post<BulkImportResult>('/services/bulk-import', { items });
  },

  async seedDentalServices() {
    return clinicApiClient.post<ClinicServiceItem[]>('/services/seed-dental');
  },

  // Procedures & Nursing Station
  async getProcedures(patientId?: string, status?: ProcedureStatus, date?: string) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (status) params.append('status', status);
    if (date) params.append('date', date);
    const qs = params.toString();
    return clinicApiClient.get<ClinicalProcedureRecord[]>(`/procedures${qs ? `?${qs}` : ''}`);
  },

  async orderProcedure(payload: {
    patientId: string;
    patientName: string;
    queueItemId?: string;
    consultationId?: string;
    procedureCode?: string;
    procedureName: string;
    category: string;
    orderedByDoctorId?: string;
    orderedByDoctorName?: string;
    clinicalNotes?: string;
    targetRoomId?: string;
    targetRoomName?: string;
    toothNumber?: number;
    toothSurface?: string;
  }) {
    return clinicApiClient.post<ClinicalProcedureRecord>('/procedures', payload);
  },

  async completeProcedure(id: string, payload: {
    performedByStaffId?: string;
    performedByStaffName?: string;
    preProcedureVitalsJson?: string;
    postProcedureVitalsJson?: string;
    medicationAdministered?: string;
    lotNumber?: string;
    expirationDate?: string;
    siteRoute?: string;
    clinicalNotes?: string;
    complications?: string;
    requiresDoctorReEvaluation?: boolean;
  }) {
    return clinicApiClient.post<ClinicalProcedureRecord>(`/procedures/${id}/complete`, payload);
  },

  async cancelProcedure(id: string, reason?: string) {
    return clinicApiClient.post<ClinicalProcedureRecord>(`/procedures/${id}/cancel`, { reason });
  },

  // Lab Orders & Diagnostic Requisitions
  async getLabOrders(
    patientId?: string,
    status?: LabOrderStatus,
    date?: string,
    options?: { includeUnsigned?: boolean }
  ) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (status) params.append('status', status);
    if (date) params.append('date', date);
    if (options?.includeUnsigned) params.append('includeUnsigned', 'true');
    const qs = params.toString();
    return clinicApiClient.get<ClinicLabOrderRecord[]>(`/lab-orders${qs ? `?${qs}` : ''}`);
  },

  async createLabOrder(payload: {
    patientId: string;
    patientName: string;
    consultationId?: string;
    orderedByDoctorId?: string;
    orderedByDoctorName?: string;
    clinicalDiagnosis?: string;
    notes?: string;
    items?: Array<{
      testName: string;
      category: string;
      instructions?: string;
      isDoneOutsideFacility?: boolean;
      diagnosticFee?: number;
      testCode?: string;
    }>;
    targetFacilityId?: string;
    targetTenantId?: string;
    queueItemId?: string;
  }) {
    return clinicApiClient.post<ClinicLabOrderRecord>('/lab-orders', payload);
  },

  async cancelLabOrder(id: string, reason?: string) {
    return clinicApiClient.post<ClinicLabOrderRecord>(`/lab-orders/${id}/cancel`, { reason });
  },

  async getLabOrderSlip(orderId: string) {
    return clinicApiClient.get<LabOrderSlipData>(`/lab-orders/${orderId}/slip`);
  },

  async attachExternalLabResult(orderId: string, payload: {
    externalLabName?: string;
    documentType: 'Photo' | 'PDF';
    documentUrl?: string;
    fileBase64?: string;
    contentType?: string;
    fileName?: string;
    notes?: string;
    uploadedBy?: string;
  }) {
    return clinicApiClient.post<ClinicLabOrderRecord>(`/lab-orders/${orderId}/attach-external-result`, payload);
  },

  async getActivePanicAlerts() {
    return clinicApiClient.get<ClinicLabOrderRecord[]>('/lab-orders/panic-alerts');
  },

  async acknowledgePanicAlert(orderId: string, doctorName: string, notes?: string) {
    return clinicApiClient.post<ClinicLabOrderRecord>(`/lab-orders/${orderId}/acknowledge-panic`, {
      acknowledgedByDoctorName: doctorName,
      notes
    });
  },

  getLabReportPdfUrl(orderId: string) {
    return clinicApiUrl(`/lab-orders/${orderId}/report-pdf`);
  },

  getLabOrderSlipPdfUrl(orderId: string, options?: { wet?: boolean }) {
    const qs = options?.wet !== undefined ? `?wet=${options.wet ? 'true' : 'false'}` : '';
    return clinicApiUrl(`/lab-orders/${orderId}/slip-pdf${qs}`);
  },

  // Interop: patient share-token import (scan-to-fetch)
  async redeemShareToken(payload: RedeemShareTokenRequest) {
    return clinicApiClient.post<RedeemShareTokenResult>('/patients/share/redeem', payload);
  },

  async getShareImportStatus(correlationId: string) {
    return clinicApiClient.get<ShareImportStatusDto>(`/patients/share/${encodeURIComponent(correlationId)}`);
  },

  // Interop: doctor lab-result review inbox
  async getLabResultReviewQueue(state: LabResultVerificationState, scope: LabResultReviewScope) {
    const params = new URLSearchParams({ state, scope });
    return clinicApiClient.get<LabResultReviewItem[]>(`/lab-results/review?${params.toString()}`);
  },

  async reviewLabResult(resultId: string, payload: ReviewLabResultRequest) {
    return clinicApiClient.post<LabResultReviewItem>(`/lab-results/${encodeURIComponent(resultId)}/review`, payload);
  },

  getLabResultFileUrl(resultId: string) {
    return clinicApiUrl(`/lab-results/${encodeURIComponent(resultId)}/file`);
  },

  // Clinical Decision Support (CDS) Safety Engine
  async evaluateCds(payload: {
    patientId?: string;
    patientAllergies?: string;
    prescriptions: Array<{ genericName: string; dosage?: string; brandName?: string }>;
    existingMedications?: Array<{ genericName: string }>;
    serumCreatinineMgDl?: number;
    egfrMlMin?: number;
    serumPotassiumMmolL?: number;
  }) {
    return clinicApiClient.post<EvaluateCdsResponse>('/prescriptions/evaluate-cds', payload);
  },

  // Daily Operations Census & Cashier Remittance
  async getDailyEodReport(date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return clinicApiClient.get<DailyEodReport>(`/reports/daily-eod${qs}`);
  },

  getDailyEodPdfUrl(date?: string): string {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return clinicApiUrl(`/reports/daily-eod/pdf${qs}`);
  },

  getDailyEodReportPdfUrl(date?: string): string {
    return this.getDailyEodPdfUrl(date);
  },

  // Advanced Reports & Executive Analytics
  async getClinicAnalytics(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<ClinicAnalytics>(`/reports/analytics${qs ? `?${qs}` : ''}`);
  },

  getAnalyticsPdfUrl(startDate?: string, endDate?: string): string {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiUrl(`/reports/analytics/pdf${qs ? `?${qs}` : ''}`);
  },

  getClinicAnalyticsPdfUrl(startDate?: string, endDate?: string): string {
    return this.getAnalyticsPdfUrl(startDate, endDate);
  },

  async getMorbidityReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<MorbidityReport>(`/reports/morbidity${qs ? `?${qs}` : ''}`);
  },

  getMorbidityPdfUrl(startDate?: string, endDate?: string): string {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiUrl(`/reports/morbidity/pdf${qs ? `?${qs}` : ''}`);
  },

  getMorbidityReportPdfUrl(startDate?: string, endDate?: string): string {
    return this.getMorbidityPdfUrl(startDate, endDate);
  },

  async getTaxDiscountAuditReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<TaxDiscountAuditReport>(`/reports/tax-discounts${qs ? `?${qs}` : ''}`);
  },

  getTaxDiscountsPdfUrl(startDate?: string, endDate?: string): string {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiUrl(`/reports/tax-discounts/pdf${qs ? `?${qs}` : ''}`);
  },

  getTaxDiscountAuditReportPdfUrl(startDate?: string, endDate?: string): string {
    return this.getTaxDiscountsPdfUrl(startDate, endDate);
  },

  getTaxDiscountAuditPdfUrl(startDate?: string, endDate?: string): string {
    return this.getTaxDiscountsPdfUrl(startDate, endDate);
  },

  async getDoctorSharesReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<DoctorSharesReport>(`/reports/doctor-shares${qs ? `?${qs}` : ''}`);
  },

  getDoctorSharesPdfUrl(startDate?: string, endDate?: string): string {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiUrl(`/reports/doctor-shares/pdf${qs ? `?${qs}` : ''}`);
  },

  getDoctorSharesReportPdfUrl(startDate?: string, endDate?: string): string {
    return this.getDoctorSharesPdfUrl(startDate, endDate);
  },

  async getCensusReport(startDate?: string, endDate?: string, options?: CensusFilterOptions) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (options?.doctorId) params.append('doctorId', options.doctorId);
    if (options?.nurseId) params.append('nurseId', options.nurseId);
    if (options?.visitType) params.append('visitType', options.visitType);
    if (options?.tableVisitType) params.append('tableVisitType', options.tableVisitType);
    if (options?.acuity) params.append('acuity', options.acuity);
    if (options?.status) params.append('status', options.status);
    if (options?.search) params.append('search', options.search);
    if (typeof options?.page === 'number') params.append('page', String(options.page));
    if (typeof options?.pageSize === 'number') params.append('pageSize', String(options.pageSize));
    const qs = params.toString();
    return clinicApiClient.get<ClinicCensusReport>(`/reports/census${qs ? `?${qs}` : ''}`);
  },

  getCensusPdfUrl(startDate?: string, endDate?: string, options?: CensusFilterOptions): string {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (options?.doctorId) params.append('doctorId', options.doctorId);
    if (options?.nurseId) params.append('nurseId', options.nurseId);
    if (options?.visitType) params.append('visitType', options.visitType);
    if (options?.acuity) params.append('acuity', options.acuity);
    if (options?.status) params.append('status', options.status);
    const qs = params.toString();
    return clinicApiUrl(`/reports/census/pdf${qs ? `?${qs}` : ''}`);
  },

  getCensusReportPdfUrl(startDate?: string, endDate?: string, options?: CensusFilterOptions): string {
    return this.getCensusPdfUrl(startDate, endDate, options);
  },

  getCensusExcelUrl(startDate?: string, endDate?: string, options?: CensusFilterOptions): string {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (options?.doctorId) params.append('doctorId', options.doctorId);
    if (options?.nurseId) params.append('nurseId', options.nurseId);
    if (options?.visitType) params.append('visitType', options.visitType);
    if (options?.acuity) params.append('acuity', options.acuity);
    if (options?.status) params.append('status', options.status);
    const qs = params.toString();
    return clinicApiUrl(`/reports/census/excel${qs ? `?${qs}` : ''}`);
  },

  getCensusReportExcelUrl(startDate?: string, endDate?: string, options?: CensusFilterOptions): string {
    return this.getCensusExcelUrl(startDate, endDate, options);
  },

  // Patient Chart
  async getPatientChart(patientId: string) {
    return clinicApiClient.get<PatientChart>(`/patients/${patientId}/chart`);
  },

  // Patient Immunizations (PhilHealth Statutory)
  async getPatientImmunizations(patientId: string) {
    return clinicApiClient.get<PatientImmunizationRecord[]>(`/patients/${patientId}/immunizations`);
  },

  async recordImmunization(patientId: string, payload: AdministerVaccinePayload) {
    return clinicApiClient.post<PatientImmunizationRecord>(`/patients/${patientId}/immunizations/administer`, payload);
  },

  async administerVaccine(patientId: string, payload: AdministerVaccinePayload) {
    return clinicApiClient.post<PatientImmunizationRecord>(`/patients/${patientId}/immunizations/administer`, payload);
  },

  async recordHistoricalImmunization(patientId: string, payload: RecordHistoricalImmunizationPayload) {
    return clinicApiClient.post<PatientImmunizationRecord>(`/patients/${patientId}/immunizations/historical`, payload);
  },

  async recordImmunizationAefi(patientId: string, immunizationId: string, payload: RecordAefiPayload) {
    return clinicApiClient.post<PatientImmunizationRecord>(`/patients/${patientId}/immunizations/${immunizationId}/aefi`, payload);
  },

  // Patient Structured Problems
  async getPatientProblems(patientId: string, status?: string) {
    const url = status ? `/patients/${patientId}/problems?status=${encodeURIComponent(status)}` : `/patients/${patientId}/problems`;
    return clinicApiClient.get<PatientProblemRecord[]>(url);
  },

  async createPatientProblem(patientId: string, payload: CreatePatientProblemPayload) {
    return clinicApiClient.post<PatientProblemRecord>(`/patients/${patientId}/problems`, payload);
  },

  async updatePatientProblemStatus(patientId: string, problemId: string, status: string, resolvedDate?: string, clinicalNotes?: string) {
    return clinicApiClient.patch<PatientProblemRecord>(`/patients/${patientId}/problems/${problemId}/status`, {
      status,
      resolvedDate,
      clinicalNotes,
    });
  },

  // Patient Structured Allergies
  async getPatientAllergies(patientId: string) {
    return clinicApiClient.get<PatientAllergyRecord[]>(`/patients/${patientId}/allergies`);
  },

  async createPatientAllergy(patientId: string, payload: CreatePatientAllergyPayload) {
    return clinicApiClient.post<PatientAllergyRecord>(`/patients/${patientId}/allergies`, payload);
  },

  async deletePatientAllergy(patientId: string, allergyId: string) {
    return clinicApiClient.delete<boolean>(`/patients/${patientId}/allergies/${allergyId}`);
  },

  // Patient Past Medical History (Personal)
  async getPastMedicalHistories(patientId: string) {
    return clinicApiClient.get<PatientMedicalHistoryResponse>(`/patients/${patientId}/medical-history`);
  },

  async savePastMedicalHistories(patientId: string, payload: SavePatientMedicalHistoriesPayload) {
    return clinicApiClient.put<PatientMedicalHistoryResponse>(`/patients/${patientId}/medical-history`, payload);
  },

  // Patient Family Medical History
  async getFamilyHistories(patientId: string) {
    return clinicApiClient.get<PatientFamilyHistoryResponse>(`/patients/${patientId}/family-history`);
  },

  async saveFamilyHistories(patientId: string, payload: SavePatientFamilyHistoriesPayload) {
    return clinicApiClient.put<PatientFamilyHistoryResponse>(`/patients/${patientId}/family-history`, payload);
  },

  // Patient Surgical History
  async getSurgicalHistories(patientId: string) {
    return clinicApiClient.get<PatientSurgicalHistory[]>(`/patients/${patientId}/surgical-history`);
  },

  async addSurgicalHistory(patientId: string, payload: UpsertPatientSurgicalHistoryPayload) {
    return clinicApiClient.post<PatientSurgicalHistory>(`/patients/${patientId}/surgical-history`, payload);
  },

  async updateSurgicalHistory(patientId: string, id: string, payload: UpsertPatientSurgicalHistoryPayload) {
    return clinicApiClient.put<PatientSurgicalHistory>(`/patients/${patientId}/surgical-history/${id}`, payload);
  },

  async deleteSurgicalHistory(patientId: string, id: string) {
    return clinicApiClient.delete<boolean>(`/patients/${patientId}/surgical-history/${id}`);
  },

  // Patient Social History
  async getSocialHistory(patientId: string) {
    return clinicApiClient.get<PatientSocialHistory | null>(`/patients/${patientId}/social-history`);
  },

  async updateSocialHistory(patientId: string, payload: UpdatePatientSocialHistoryPayload) {
    return clinicApiClient.put<PatientSocialHistory>(`/patients/${patientId}/social-history`, payload);
  },

  // Patient Reproductive History
  async getReproductiveHistory(patientId: string) {
    return clinicApiClient.get<PatientReproductiveHistory | null>(`/patients/${patientId}/reproductive-history`);
  },

  async updateReproductiveHistory(patientId: string, payload: UpdatePatientReproductiveHistoryPayload) {
    return clinicApiClient.put<PatientReproductiveHistory>(`/patients/${patientId}/reproductive-history`, payload);
  },

  // Patient Physical Examination Profile
  async getPatientPhysicalExam(patientId: string) {
    return clinicApiClient.get<PatientPhysicalExamProfile>(`/patients/${patientId}/physical-exam`);
  },

  async updatePatientPhysicalExam(patientId: string, payload: UpdatePatientPhysicalExamPayload) {
    return clinicApiClient.put<PatientPhysicalExamProfile>(`/patients/${patientId}/physical-exam`, payload);
  },

  // NCD Risk Assessment
  async getNcdRiskAssessments(patientId: string, includeVoided = false) {
    const qs = includeVoided ? '?includeVoided=true' : '';
    return clinicApiClient.get<NcdRiskAssessment[]>(`/patients/${patientId}/ncd-risk-assessment${qs}`);
  },

  async saveNcdRiskAssessment(patientId: string, payload: SaveNcdRiskAssessmentPayload) {
    return clinicApiClient.post<NcdRiskAssessment>(`/patients/${patientId}/ncd-risk-assessment`, payload);
  },

  async updateNcdRiskAssessment(patientId: string, assessmentId: string, payload: SaveNcdRiskAssessmentPayload) {
    return clinicApiClient.put<NcdRiskAssessment>(`/patients/${patientId}/ncd-risk-assessment/${assessmentId}`, payload);
  },

  async voidNcdRiskAssessment(patientId: string, assessmentId: string, reason?: string) {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return clinicApiClient.delete<boolean>(`/patients/${patientId}/ncd-risk-assessment/${assessmentId}${qs}`);
  },

  // Pediatric WHO Z-Score Calculation
  async calculatePediatricZScore(payload: CalculatePediatricZScorePayload) {
    return clinicApiClient.post<PediatricZScoreResult | null>('/patients/calculate-zscore', payload);
  },

  // Staff & Roles
  async getStaff(role?: StaffRole, isActive?: boolean) {
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (typeof isActive === 'boolean') params.append('isActive', String(isActive));
    const qs = params.toString();
    return clinicApiClient.get<StaffMember[]>(`/staff${qs ? `?${qs}` : ''}`);
  },

  async createStaff(payload: CreateStaffPayload) {
    return clinicApiClient.post<StaffMember>('/staff', payload);
  },

  async updateStaff(id: string, payload: UpdateStaffPayload) {
    return clinicApiClient.put<StaffMember>(`/staff/${id}`, payload);
  },

  async getMyProfile() {
    return clinicApiClient.get<StaffMember>('/staff/me');
  },

  async updateMyProfile(payload: UpdateMyProfilePayload) {
    return clinicApiClient.put<StaffMember>('/staff/me', payload);
  },

  async deactivateStaff(id: string) {
    return clinicApiClient.delete<boolean>(`/staff/${id}`);
  },

  async activateStaff(id: string) {
    return clinicApiClient.post<StaffMember>(`/staff/${id}/activate`, {});
  },

  async reactivateStaff(id: string) {
    return clinicApiClient.post<StaffMember>(`/staff/${id}/reactivate`, {});
  },

  async resendStaffInvitation(id: string, sendInviteEmail = true) {
    return clinicApiClient.post<StaffMember>(`/staff/${id}/resend-invite`, { sendInviteEmail });
  },

  async revokeStaffInvitation(id: string) {
    return clinicApiClient.post<boolean>(`/staff/${id}/revoke-invite`, {});
  },

  async reinviteStaffMember(id: string, sendInviteEmail = true) {
    return clinicApiClient.post<StaffMember>(`/staff/${id}/reinvite`, { sendInviteEmail });
  },

  async removeStaffMember(id: string) {
    return clinicApiClient.delete<boolean>(`/staff/${id}/permanent`);
  },

  async suspendStaffMember(id: string) {
    return clinicApiClient.post<StaffMember>(`/staff/${id}/suspend`, {});
  },

  /** Sets or auto-generates a temporary password, or issues a password reset link/email; the staff member must change it at next sign-in. Requires `staff:manage`. */
  async resetStaffPassword(
    id: string,
    temporaryPassword?: string,
    options?: { sendResetEmail?: boolean; generateResetLink?: boolean }
  ) {
    return clinicApiClient.post<ResetStaffPasswordResult>(`/staff/${id}/reset-password`, {
      temporaryPassword: temporaryPassword || undefined,
      sendResetEmail: options?.sendResetEmail ?? false,
      generateResetLink: options?.generateResetLink ?? false,
    });
  },

  /** Sets a temporary password; the staff member must change it at next sign-in. Requires `staff:manage`. */
  async setStaffTemporaryPassword(id: string, temporaryPassword: string) {
    return this.resetStaffPassword(id, temporaryPassword);
  },

  /** Signs the staff member out of every device. Requires `staff:manage`. */
  async revokeStaffSessions(id: string) {
    return clinicApiClient.post(`/staff/${id}/revoke-sessions`, {});
  },

  async getLicenseStatus() {
    return clinicApiClient.get<FacilityLicenseStatus>('/clinic/license');
  },

  /**
   * Resolves a workspace input (which may be a tenant slug or a facility slug)
   * into a verified facility license status with its true facilitySlug.
   */
  async resolveWorkspace(workspaceInput: string): Promise<[FacilityLicenseStatus | null, ApiError | null]> {
    const clean = workspaceInput.trim().toLowerCase();
    if (!clean) {
      return [null, new ApiError('Workspace name is required.', 400)];
    }

    // 1. Direct facility probe against clinic server
    const [directFacility, directErr] = await clinicApiClient.get<FacilityLicenseStatus>('/clinic/license', {
      headers: { 'X-Facility-Slug': clean },
      params: { facilitySlug: clean },
    });

    if (directFacility && directFacility.status === 'Active' && directFacility.facilitySlug) {
      return [directFacility, null];
    }

    // 2. Tenant workspace probe against clinic server
    const [tenantFacility, tenantErr] = await clinicApiClient.get<FacilityLicenseStatus>('/clinic/license', {
      headers: { 'X-Tenant-Id': clean },
      params: { tenant: clean },
    });

    if (tenantFacility && tenantFacility.facilitySlug && tenantFacility.status === 'Active') {
      return [tenantFacility, null];
    }

    // 3. If tenant license check returned a clinic name without facilitySlug,
    // derive candidate slug from the clinic name (e.g. "Nextstep OPD" -> "nextstep") and verify against clinic server
    if (tenantFacility?.clinicName) {
      const candidateSlug = tenantFacility.clinicName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .split('-')[0];
      if (candidateSlug && candidateSlug !== clean) {
        const [verifiedByClinicName] = await clinicApiClient.get<FacilityLicenseStatus>('/clinic/license', {
          headers: { 'X-Facility-Slug': candidateSlug },
          params: { facilitySlug: candidateSlug },
        });
        if (verifiedByClinicName && verifiedByClinicName.status === 'Active' && verifiedByClinicName.facilitySlug) {
          return [verifiedByClinicName, null];
        }
      }
    }

    // 4. Query Portal directory to resolve tenant -> facility mapping (if portal is reachable)
    const portalUrl = getSetting('EXPO_PUBLIC_PORTAL_URL') || getPortalBaseUrl();
    const cleanPortalBase = portalUrl.endsWith('/api/v1') ? portalUrl : `${portalUrl.replace(/\/+$/, '')}/api/v1`;
    try {
      const portalRes = await axios.get(`${cleanPortalBase}/tenants/lookup/${encodeURIComponent(clean)}`, {
        timeout: 5000,
      });
      const data = portalRes?.data;
      if (data?.exists) {
        const resolvedFacilitySlug = data.facilitySlug || (data.facilityId ? clean : null);
        if (resolvedFacilitySlug) {
          const [verified] = await clinicApiClient.get<FacilityLicenseStatus>('/clinic/license', {
            headers: { 'X-Facility-Slug': resolvedFacilitySlug },
            params: { facilitySlug: resolvedFacilitySlug },
          });
          if (verified && verified.status === 'Active' && verified.facilitySlug) {
            return [verified, null];
          }
        }
      }
    } catch {
      // Portal lookup unavailable; fall through
    }

    if (tenantFacility && tenantFacility.facilitySlug) {
      return [tenantFacility, null];
    }
    if (directFacility && directFacility.facilitySlug) {
      return [directFacility, null];
    }

    return [null, directErr || tenantErr || new ApiError(`Workspace "${clean}" was not found or has no active facilities registered.`, 404)];
  },

  async applyLicense(licenseToken: string) {
    return clinicApiClient.post<FacilityLicenseStatus>('/clinic/license/apply', { licenseToken });
  },

  async getRoles() {
    return clinicApiClient.get<ClinicRole[]>('/roles');
  },

  async getPermissions() {
    return clinicApiClient.get<string[]>('/roles/permissions');
  },

  async createRole(payload: { name: string; description?: string; permissions: string[] }) {
    return clinicApiClient.post<ClinicRole>('/roles', payload);
  },

  async updateRole(id: string, payload: { name: string; description?: string; permissions: string[] }) {
    return clinicApiClient.put<ClinicRole>(`/roles/${id}`, payload);
  },

  async deleteRole(id: string) {
    return clinicApiClient.delete<boolean>(`/roles/${id}`);
  },

  // Clinic Rooms & Stations
  async getRooms(activeOnly: boolean = false) {
    const qs = activeOnly ? '?activeOnly=true' : '';
    return clinicApiClient.get<ClinicRoom[]>(`/rooms${qs}`);
  },

  async createRoom(payload: {
    name: string;
    code?: string | null;
    type: ClinicRoomType;
    description?: string | null;
    displayOrder?: number;
    sortOrder?: number;
    isActive?: boolean;
    assignedStaffIds?: string[];
  }) {
    return clinicApiClient.post<ClinicRoom>('/rooms', payload);
  },

  async updateRoom(id: string, payload: {
    name: string;
    code?: string | null;
    type: ClinicRoomType;
    description?: string | null;
    displayOrder?: number;
    sortOrder?: number;
    isActive?: boolean;
    assignedStaffIds?: string[];
  }) {
    return clinicApiClient.put<ClinicRoom>(`/rooms/${id}`, payload);
  },

  async deleteRoom(id: string) {
    return clinicApiClient.delete<boolean>(`/rooms/${id}`);
  },

  async reorderRooms(orderedIds: string[]) {
    return clinicApiClient.post<boolean>('/rooms/reorder', { orderedIds });
  },

  // Patients Directory & Master Patient Index
  async getPatients(
    search?: string,
    hasAlerts?: boolean,
    page: number = 1,
    pageSize: number = 50,
    filterMode?: string,
    staffId?: string,
    doctorId?: string,
    queueDate?: string,
    roomIds?: string[]
  ) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (typeof hasAlerts === 'boolean') params.append('hasAlerts', String(hasAlerts));
    if (filterMode) params.append('filterMode', filterMode);
    if (staffId) params.append('staffId', staffId);
    if (doctorId) params.append('doctorId', doctorId);
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (queueDate) params.append('queueDate', queueDate);
    if (roomIds && roomIds.length > 0) {
      roomIds.forEach((r) => params.append('roomIds', r));
    }
    const qs = params.toString();
    return clinicApiClient.get<ClinicPatient[]>(`/patients?${qs}`);
  },

  async getPatientCounts(
    search?: string,
    staffId?: string,
    doctorId?: string,
    roomIds?: string[],
    queueDate?: string
  ) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (staffId) params.append('staffId', staffId);
    if (doctorId) params.append('doctorId', doctorId);
    if (queueDate) params.append('queueDate', queueDate);
    if (roomIds && roomIds.length > 0) {
      roomIds.forEach((r) => params.append('roomIds', r));
    }
    const qs = params.toString();
    return clinicApiClient.get<PatientDirectoryCounts>(`/patients/counts${qs ? `?${qs}` : ''}`);
  },


  async getPatientById(id: string) {
    return clinicApiClient.get<ClinicPatient>(`/patients/${id}`);
  },

  async checkPatientDuplicates(params: CheckPatientDuplicatesParams, config?: AxiosRequestConfig) {
    return clinicApiClient.get<DuplicatePatientCheckResult>('/patients/check-duplicates', {
      params,
      ...config,
    });
  },

  async registerPatient(payload: RegisterPatientPayload, config?: AxiosRequestConfig) {
    return clinicApiClient.post<ClinicPatient>('/patients', payload, config);
  },

  async bulkRegisterPatients(patients: RegisterPatientPayload[]) {
    return clinicApiClient.post<{ totalProcessed: number; successCount: number; createdPatients: ClinicPatient[] }>('/patients/bulk', {
      patients
    });
  },

  async updatePatient(id: string, payload: RegisterPatientPayload) {
    return clinicApiClient.put<ClinicPatient>(`/patients/${id}`, payload);
  },

  // Appointment Scheduling & Desk Bookings
  async createAppointment(payload: {
    patientId: string;
    patientName: string;
    doctorId?: string;
    doctorName?: string;
    scheduledAt: string;
    durationMinutes?: number;
    serviceType?: string;
    reason?: string;
    notes?: string;
    appointmentType?: 'InPerson' | 'Teleconsult' | string;
    paymentPolicy?: TeleconsultPaymentPolicy | string;
  }) {
    return clinicApiClient.post<AppointmentItem>('/appointments', payload);
  },

  async rescheduleAppointment(id: string, payload: RescheduleAppointmentRequest) {
    return clinicApiClient.put<AppointmentItem>(`/appointments/${id}/reschedule`, payload);
  },

  async cancelAppointment(id: string, reason?: string) {
    return clinicApiClient.put<AppointmentItem>(`/appointments/${id}/cancel`, { reason });
  },

  async sendAppointmentReminder(id: string) {
    return clinicApiClient.post<AppointmentItem>(`/appointments/${id}/remind`);
  },

  // Doctor Schedules, Rosters & Availability
  async getDoctorScheduleTemplates(doctorId: string) {
    return clinicApiClient.get<DoctorScheduleTemplateItem[]>(`/doctors/${doctorId}/schedules/templates`);
  },

  async upsertDoctorScheduleTemplate(doctorId: string, payload: {
    doctorName?: string;
    dayOfWeek: number | string;
    startTime: string;
    endTime: string;
    isOvernightShift?: boolean;
    slotDurationMinutes?: number;
    maxPatientsPerSlot?: number;
    isActive?: boolean;
    effectiveStartDate?: string;
    effectiveEndDate?: string;
    breaks?: DoctorBreakTimeItem[];
  }) {
    return clinicApiClient.post<DoctorScheduleTemplateItem>(`/doctors/${doctorId}/schedules/templates`, payload);
  },

  async deleteDoctorScheduleTemplate(doctorId: string, templateId: string) {
    return clinicApiClient.delete<boolean>(`/doctors/${doctorId}/schedules/templates/${templateId}`);
  },

  async getDoctorAvailableSlots(doctorId: string, date: string, interval?: number) {
    const qs = interval ? `?date=${encodeURIComponent(date)}&interval=${interval}` : `?date=${encodeURIComponent(date)}`;
    return clinicApiClient.get<DoctorAvailabilityData>(`/doctors/${doctorId}/schedules/availability${qs}`);
  },

  async getDoctorLeaves(doctorId: string) {
    return clinicApiClient.get<DoctorLeaveItem[]>(`/doctors/${doctorId}/schedules/leaves`);
  },

  async createDoctorLeave(doctorId: string, payload: {
    doctorName?: string;
    startDate: string;
    endDate: string;
    partialDayStartTime?: string;
    partialDayEndTime?: string;
    reason?: string;
    leaveType?: string;
  }) {
    return clinicApiClient.post<DoctorLeaveItem>(`/doctors/${doctorId}/schedules/leaves`, payload);
  },

  async deleteDoctorLeave(doctorId: string, leaveId: string) {
    return clinicApiClient.delete<boolean>(`/doctors/${doctorId}/schedules/leaves/${leaveId}`);
  },

  // Document Issuance (Medical Certificates & Referrals)
  async issueMedicalCertificate(payload: {
    patientId: string;
    patientName: string;
    consultationId?: string;
    queueItemId?: string;
    doctorId: string;
    doctorName: string;
    prcLicenseNumber: string;
    ptrNumber?: string;
    diagnosis: string;
    clinicalFindings?: string;
    fitnessStatus?: string;
    recommendedRestDays?: number;
    restStartDate?: string;
    restEndDate?: string;
    purpose?: string;
    remarks?: string;
  }) {
    return clinicApiClient.post<MedicalCertificateRecord>('/documents/medical-certificates', payload);
  },

  async getMedicalCertificates(
    patientId?: string,
    doctorId?: string,
    options?: { includeUnsigned?: boolean }
  ) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (doctorId) params.append('doctorId', doctorId);
    if (options?.includeUnsigned) params.append('includeUnsigned', 'true');
    const qs = params.toString();
    return clinicApiClient.get<MedicalCertificateRecord[]>(`/documents/medical-certificates${qs ? `?${qs}` : ''}`);
  },

  getMedicalCertificatePdfUrl(id: string, options?: { wet?: boolean }) {
    const qs = options?.wet !== undefined ? `?wet=${options.wet ? 'true' : 'false'}` : '';
    return clinicApiUrl(`/documents/medical-certificates/${id}/pdf${qs}`);
  },

  async issueReferralLetter(payload: {
    patientId: string;
    patientName: string;
    consultationId?: string;
    queueItemId?: string;
    referringDoctorId: string;
    referringDoctorName: string;
    referredToDoctor?: string;
    referredToFacility: string;
    referredDepartment: string;
    urgency?: string;
    reasonForReferral: string;
    provisionalDiagnosis: string;
    clinicalSummary: string;
    currentMedications?: string;
    attachedDiagnostics?: string;
  }) {
    return clinicApiClient.post<ReferralLetterRecord>('/documents/referrals', payload);
  },

  async getReferralLetters(
    patientId?: string,
    doctorId?: string,
    options?: { includeUnsigned?: boolean }
  ) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (doctorId) params.append('doctorId', doctorId);
    if (options?.includeUnsigned) params.append('includeUnsigned', 'true');
    const qs = params.toString();
    return clinicApiClient.get<ReferralLetterRecord[]>(`/documents/referrals${qs ? `?${qs}` : ''}`);
  },

  getReferralLetterPdfUrl(id: string, options?: { wet?: boolean }) {
    const qs = options?.wet !== undefined ? `?wet=${options.wet ? 'true' : 'false'}` : '';
    return clinicApiUrl(`/documents/referrals/${id}/pdf${qs}`);
  },


  // Records & Attachments
  async uploadRecordAttachment(payload: {
    patientId: string;
    consultationId?: string;
    recordType: string;
    title: string;
    fileName: string;
    contentType: string;
    fileSizeBytes: number;
    storageUri: string;
    documentDate: string;
    notes?: string;
    uploadedByStaffId?: string;
    uploadedByStaffName?: string;
  }, config?: AxiosRequestConfig) {
    return clinicApiClient.post<ClinicRecordAttachmentRecord>('/records/attachments', payload, config);
  },

  async getPatientRecordAttachments(patientId: string, recordType?: string) {
    const qs = recordType ? `?recordType=${encodeURIComponent(recordType)}` : '';
    return clinicApiClient.get<ClinicRecordAttachmentRecord[]>(`/records/patients/${patientId}${qs}`);
  },

  async verifyRecordAttachment(
    attachmentId: string,
    isApproved: boolean,
    rejectionReason?: string,
    verifiedByStaffName?: string,
    verifiedByStaffId?: string,
  ) {
    return clinicApiClient.post<ClinicRecordAttachmentRecord>(`/records/attachments/${attachmentId}/verify`, {
      isApproved,
      rejectionReason,
      verifiedByStaffName: verifiedByStaffName || undefined,
      verifiedByStaffId: verifiedByStaffId || undefined,
    });
  },

  getRecordAttachmentDownloadUrl(attachmentId: string) {
    return clinicApiUrl(`/records/attachments/${attachmentId}/download`);
  },

  async uploadRecordAttachmentFile(formData: FormData) {
    return clinicApiClient.post<ClinicRecordAttachmentRecord>('/records/attachments/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Tenant Custom Fields
  async getCustomFields(entityType = 'ClinicPatient', category?: string) {
    const qs = category ? `?entityType=${entityType}&category=${encodeURIComponent(category)}` : `?entityType=${entityType}`;
    return clinicApiClient.get<ClinicCustomFieldDefinition[]>(`/custom-fields${qs}`);
  },

  async createCustomField(payload: Partial<ClinicCustomFieldDefinition>) {
    return clinicApiClient.post<ClinicCustomFieldDefinition>('/custom-fields', payload);
  },

  async updateCustomField(id: string, payload: Partial<ClinicCustomFieldDefinition>) {
    return clinicApiClient.put<ClinicCustomFieldDefinition>(`/custom-fields/${id}`, payload);
  },

  async deleteCustomField(id: string) {
    return clinicApiClient.delete<boolean>(`/custom-fields/${id}`);
  },

  async reorderCustomFields(
    payload: string[] | { orderedIds?: string[]; items?: { id: string; displayOrder: number }[]; entityType?: string }
  ) {
    const body = Array.isArray(payload)
      ? { orderedIds: payload, entityType: 'ClinicPatient' }
      : payload;
    return clinicApiClient.put<ClinicCustomFieldDefinition[]>('/custom-fields/reorder', body);
  },

  async installTemplateBundle(templateKey: string, entityType = 'ClinicPatient') {
    const normalizedKey = templateKey.toLowerCase();
    let backendKey = templateKey;
    if (normalizedKey === 'university' || normalizedKey === 'ustp' || normalizedKey === 'university_ustp') {
      backendKey = 'university_ustp';
    } else if (normalizedKey === 'workplace' || normalizedKey === 'workplace_corporate') {
      backendKey = 'workplace_corporate';
    } else if (normalizedKey === 'demographics' || normalizedKey === 'general_demographics') {
      backendKey = 'general_demographics';
    } else if (
      normalizedKey === 'intake' ||
      normalizedKey === 'patient_intake' ||
      normalizedKey === 'patient_intake_contacts' ||
      normalizedKey === 'contacts' ||
      normalizedKey === 'address_emergency' ||
      normalizedKey === 'intake_contacts'
    ) {
      backendKey = 'patient_intake_contacts';
    } else if (normalizedKey === 'address' || normalizedKey === 'addresses' || normalizedKey === 'patient_intake_address') {
      backendKey = 'patient_intake_address';
    } else if (normalizedKey === 'emergency' || normalizedKey === 'emergency_contacts' || normalizedKey === 'patient_intake_emergency') {
      backendKey = 'patient_intake_emergency';
    }
    return clinicApiClient.post<ClinicCustomFieldDefinition[]>('/custom-fields/templates/install', {
      templateKey: backendKey,
      entityType,
    });
  },

  async installCustomFieldTemplate(templateKey: string, entityType = 'ClinicPatient') {
    return this.installTemplateBundle(templateKey, entityType);
  },

  async getCustomFieldTemplates(entityType = 'ClinicPatient') {
    return clinicApiClient.get<any[]>(`/custom-fields/templates?entityType=${encodeURIComponent(entityType)}`);
  },

  // Clinic Preferences / Settings
  async getSettings() {
    return clinicApiClient.get<ClinicSettingsRecord>('/settings');
  },

  async updateSettings(payload: Partial<ClinicSettingsRecord>) {
    const finalPayload = { ...payload };
    if (finalPayload.dohLicenseToOperate !== undefined && finalPayload.letterheadDohLto === undefined) {
      finalPayload.letterheadDohLto = finalPayload.dohLicenseToOperate;
    } else if (finalPayload.letterheadDohLto !== undefined && finalPayload.dohLicenseToOperate === undefined) {
      finalPayload.dohLicenseToOperate = finalPayload.letterheadDohLto;
    }
    return clinicApiClient.put<ClinicSettingsRecord>('/settings', finalPayload);
  },

  async overridePhilHealthSettings(payload: {
    accreditationNumber: string;
    pmccNumber: string;
    softwareCertificateId: string;
    username?: string;
    password?: string;
    cipherKey?: string;
    konsultaEndpoint?: string;
  }) {
    return clinicApiClient.post<ClinicSettingsRecord>('/settings/philhealth/override', payload);
  },

  async revertPhilHealthToBranch() {
    return clinicApiClient.post<ClinicSettingsRecord>('/settings/philhealth/revert', {});
  },

  getSampleDocumentPdfUrl(docType: string, options?: { wet?: boolean; paperSize?: string }) {
    const params: string[] = [];
    if (docType) params.push(`docType=${encodeURIComponent(docType)}`);
    if (options?.wet !== undefined) {
      params.push(`wet=${options.wet ? 'true' : 'false'}`);
    }
    if (options?.paperSize) {
      params.push(`paperSize=${encodeURIComponent(options.paperSize)}`);
    }
    const qs = params.length > 0 ? `?${params.join('&')}` : '';
    return clinicApiUrl(`/settings/sample-document-pdf${qs}`);
  },

  async getWorkspaceProfile() {
    return clinicApiClient.get<WorkspaceProfile>('/settings/workspace-profile');
  },

  // Clinic Publishing & Dynamic Booking Capacity
  async getPublishingReadiness() {
    return clinicApiClient.get<ClinicPublishingReadiness>('/clinic-settings/readiness');
  },

  async publishToDirectory(isPublished: boolean) {
    return clinicApiClient.put<ClinicPublishingResult>('/clinic-settings/directory-publishing', {
      isPublished,
    });
  },

  async toggleBookingPause(isPaused: boolean) {
    return clinicApiClient.put<ClinicBookingPauseResult>('/clinic-settings/booking-pause', {
      isPaused,
    });
  },

  getReceptionPlacardPdfUrl(params?: { qrUrl?: string; joinCode?: string; expiresAt?: string }) {
    const qp = new URLSearchParams();
    if (params?.qrUrl) qp.append('qrUrl', params.qrUrl);
    if (params?.joinCode) qp.append('joinCode', params.joinCode);
    if (params?.expiresAt) qp.append('expiresAt', params.expiresAt);
    const qs = qp.toString();
    return clinicApiUrl(`/settings/reception-placard-pdf${qs ? `?${qs}` : ''}`);
  },

  async getPublicQueueDisplay(clinicId?: string, facilitySlug?: string, tenantSlug?: string, pin?: string) {
    const params = new URLSearchParams();
    if (clinicId) params.append('clinicId', clinicId);
    if (facilitySlug) params.append('facilitySlug', facilitySlug);
    if (tenantSlug) params.append('tenantSlug', tenantSlug);
    if (pin) params.append('pin', pin);
    params.append('_t', Date.now().toString());
    const query = params.toString();
    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    };
    if (pin) headers['X-Queue-Pin'] = pin;
    return clinicApiClient.get<any>(`/public/queue/display${query ? `?${query}` : ''}`, { headers });
  },

  // PhilHealth Yakap (formerly Konsulta)
  async getYakapTransmittals(status?: string, year?: string) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (year) params.append('year', year);
    const qs = params.toString();
    return clinicApiClient.get<YakapTransmittal[]>(`/yakap/transmittals${qs ? `?${qs}` : ''}`);
  },

  async getEligibleYakapEncounters(params?: {
    reportTagging?: string;
    startDate?: string;
    endDate?: string;
    patientId?: string;
  }) {
    const qp = new URLSearchParams();
    if (params?.reportTagging) qp.append('reportTagging', params.reportTagging);
    if (params?.startDate) qp.append('startDate', params.startDate);
    if (params?.endDate) qp.append('endDate', params.endDate);
    if (params?.patientId) qp.append('patientId', params.patientId);
    const qs = qp.toString();
    return clinicApiClient.get<EligibleYakapEncounter[]>(`/yakap/encounters/eligible${qs ? `?${qs}` : ''}`);
  },

  async getYakapTransmittalById(id: string) {
    return clinicApiClient.get<YakapTransmittal>(`/yakap/transmittals/${id}`);
  },

  async getYakapTransmittalRawXml(id: string) {
    return clinicApiClient.get<string>(`/yakap/transmittals/${id}/raw-xml`);
  },

  async createYakapTransmittal(payload: CreateYakapTransmittalPayload) {
    const body = {
      ...payload,
      consultationEncounterIds: payload.consultationEncounterIds || payload.encounterIds,
    };
    return clinicApiClient.post<YakapTransmittal>('/yakap/transmittals', body);
  },

  async validateYakapTransmittal(id: string) {
    return clinicApiClient.post<YakapTransmittal>(`/yakap/transmittals/${id}/validate`, {});
  },

  async submitYakapTransmittal(id: string) {
    return clinicApiClient.post<YakapTransmittal>(`/yakap/transmittals/${id}/submit`, {});
  },

  async validatePhilHealthPin(pin: string) {
    return clinicApiClient.get<PinValidationResult>(`/yakap/pin/${encodeURIComponent(pin)}/validate`);
  },

  async extractYakapMasterlist(payload: { hciAccreditationNumber: string; cipherKey: string }) {
    return clinicApiClient.post<YakapMasterlistAssignment[]>('/yakap/masterlist/extract', payload);
  },

  // PhilHealth SOAP Sandbox & Simulation
  async runSoapSimulation(payload?: { accreditationNumber?: string; cipherKey?: string }) {
    return clinicApiClient.post<SoapSimulationReport>('/yakap/simulation/run-e2e', payload || {});
  },

  async getSoapSandboxStatus() {
    return clinicApiClient.get<SoapSandboxStatus>('/yakap/simulation/status');
  },

  async setSoapSandboxScenario(scenario: SoapSimulationScenario | number) {
    return clinicApiClient.post<SoapSandboxStatus>('/yakap/simulation/scenario', { scenario });
  },

  async resetSoapSandbox() {
    return clinicApiClient.post<SoapSandboxStatus>('/yakap/simulation/reset', {});
  },

  // PhilHealth Credential Configuration & Connectivity
  async configurePhilHealthCredentials(payload: PhilHealthCredentialPayload) {
    return clinicApiClient.post<PhilHealthConfigStatus>('/yakap/credentials/configure', payload);
  },

  async getPhilHealthConfigStatus() {
    return clinicApiClient.get<PhilHealthConfigStatus>('/yakap/credentials/status');
  },

  async testPhilHealthConnection() {
    return clinicApiClient.post<string>('/yakap/credentials/test-connection', {});
  },

  // Standalone PhilHealth Patient Profile (Online, Offline & On-Premise)
  async getPhilHealthPatientProfile(patientId: string) {
    return clinicApiClient.get<PhilHealthPatientProfile>(`/yakap/patients/${patientId}/profile`);
  },

  async updatePhilHealthPatientProfile(patientId: string, profile: PhilHealthPatientProfile) {
    return clinicApiClient.put<PhilHealthPatientProfile>(`/yakap/patients/${patientId}/profile`, profile);
  },


  // PhilHealth GAMOT & UPSC. Reached through the clinic server, which talks to the pharmacy with its own service key.
  async getGamotLedger(pin: string, year?: string) {
    const qs = year ? `?year=${encodeURIComponent(year)}` : '';
    return clinicApiClient.get<GamotBeneficiaryLedger>(`/yakap/gamot/ledger/${encodeURIComponent(pin)}${qs}`);
  },

  async getGamotFormulary(search?: string, category?: string) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    const qs = params.toString();
    return clinicApiClient.get<GamotFormularyItem[]>(`/yakap/gamot/formulary${qs ? `?${qs}` : ''}`);
  },

  async generateUpsc(payload: GenerateUpscPayload) {
    return clinicApiClient.post<UpscGenerateResult>('/yakap/gamot/upsc/generate', payload);
  },

  async validateUpsc(payload: ValidateUpscPayload) {
    return clinicApiClient.post<UpscVerifyResult>('/yakap/gamot/upsc/validate', payload);
  },

  async dispenseGamot(payload: DispenseGamotPayload) {
    return clinicApiClient.post<any>('/yakap/gamot/dispense', payload);
  },

  async reverseGamotTransaction(id: string, payload: ReverseGamotPayload) {
    return clinicApiClient.post<GamotLedgerTransaction>(`/yakap/gamot/transactions/${id}/reverse`, payload);
  },

  // Dev Seeder & Scalability Testing (Development Environment)
  async seedClinicData(options?: { count?: number; clearExisting?: boolean; clinicId?: string; tenantId?: string }) {
    const params = new URLSearchParams();
    if (options?.count) params.append('count', String(options.count));
    if (options?.clearExisting !== undefined) params.append('clearExisting', String(options.clearExisting));
    if (options?.clinicId) params.append('clinicId', options.clinicId);
    if (options?.tenantId) params.append('tenantId', options.tenantId);
    const qs = params.toString();
    return clinicApiClient.post<PatientSeedResult>(
      `/dev/seed-patients${qs ? `?${qs}` : ''}`,
      null,
      { timeout: 300_000 }
    );
  },

  async getClinicSeedStatus(clinicId?: string) {
    const qs = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : '';
    return clinicApiClient.get<SeedStatusResult>(`/dev/seed-status${qs}`);
  },

  async clearClinicSeedData(options?: { clinicId?: string; purgeAll?: boolean } | string) {
    let clinicId: string | undefined;
    let purgeAll = false;
    if (typeof options === 'string') {
      clinicId = options;
    } else if (options) {
      clinicId = options.clinicId;
      purgeAll = !!options.purgeAll;
    }

    const params = new URLSearchParams();
    if (clinicId) params.append('clinicId', clinicId);
    if (purgeAll) params.append('purgeAll', 'true');
    const qs = params.toString();
    return clinicApiClient.delete<{ clearedCount: number; clinicId?: string; purgeAll?: boolean }>(
      `/dev/clear-patients${qs ? `?${qs}` : ''}`,
      { timeout: 300_000 }
    );
  },

  async getStaffNotifications(params?: {
    unreadOnly?: boolean;
    category?: StaffNotificationCategory;
    urgency?: NotificationUrgency;
    limit?: number;
  }) {
    const qp = new URLSearchParams();
    if (params?.unreadOnly !== undefined) qp.append('unreadOnly', String(params.unreadOnly));
    if (params?.category) qp.append('category', params.category);
    if (params?.urgency) qp.append('urgency', params.urgency);
    if (params?.limit) qp.append('limit', String(params.limit));
    const qs = qp.toString();
    return clinicApiClient.get<StaffNotificationListResponse>(`/notifications${qs ? `?${qs}` : ''}`);
  },

  async markStaffNotificationRead(id: string) {
    return clinicApiClient.post<boolean>(`/notifications/${id}/read`);
  },

  async markAllStaffNotificationsRead() {
    return clinicApiClient.post<number>('/notifications/read-all');
  },

  // â”€â”€ Audit Trail & Forensic Logging (Milestone 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getAuditLogs(params?: AuditFilterParams) {
    const qp = new URLSearchParams();
    if (params?.category && params.category !== 'All') qp.append('category', params.category);
    if (params?.severity && params.severity !== 'All') qp.append('severity', params.severity);
    if (params?.action) qp.append('action', params.action);
    if (params?.actorId) qp.append('actorId', params.actorId);
    if (params?.entityId) qp.append('entityId', params.entityId);
    if (params?.search) qp.append('search', params.search);
    if (params?.startDate) qp.append('startDate', params.startDate);
    if (params?.endDate) qp.append('endDate', params.endDate);
    if (params?.before) qp.append('before', params.before);
    if (params?.pageSize) qp.append('pageSize', String(params.pageSize));
    const qs = qp.toString();
    return clinicApiClient.get<AuditLogListDto>(`/audit${qs ? `?${qs}` : ''}`);
  },

  async getAuditEntryDetail(id: string) {
    return clinicApiClient.get<ClinicAuditEntryDetailDto>(`/audit/${id}`);
  },

  async exportAuditLogs(params?: AuditExportParams) {
    const qp = new URLSearchParams();
    if (params?.format) qp.append('format', params.format);
    if (params?.category && params.category !== 'All') qp.append('category', params.category);
    if (params?.severity && params.severity !== 'All') qp.append('severity', params.severity);
    if (params?.action) qp.append('action', params.action);
    if (params?.actorId) qp.append('actorId', params.actorId);
    if (params?.entityId) qp.append('entityId', params.entityId);
    if (params?.search) qp.append('search', params.search);
    if (params?.startDate) qp.append('startDate', params.startDate);
    if (params?.endDate) qp.append('endDate', params.endDate);
    if (params?.limit) qp.append('limit', String(params.limit));
    const qs = qp.toString();
    return clinicApiClient.getBlob(`/audit/export${qs ? `?${qs}` : ''}`);
  },

  getAuditExportUrl(params?: AuditExportParams): string {
    const qp = new URLSearchParams();
    if (params?.format) qp.append('format', params.format);
    if (params?.category && params.category !== 'All') qp.append('category', params.category);
    if (params?.severity && params.severity !== 'All') qp.append('severity', params.severity);
    if (params?.action) qp.append('action', params.action);
    if (params?.actorId) qp.append('actorId', params.actorId);
    if (params?.entityId) qp.append('entityId', params.entityId);
    if (params?.search) qp.append('search', params.search);
    if (params?.startDate) qp.append('startDate', params.startDate);
    if (params?.endDate) qp.append('endDate', params.endDate);
    if (params?.limit) qp.append('limit', String(params.limit));
    const qs = qp.toString();
    return clinicApiUrl(`/audit/export${qs ? `?${qs}` : ''}`);
  },

  /**
   * Pluggable Global Search client across all domain entities and settings.
   */
  async search(
    query: string,
    category?: string,
    limit: number = 20,
    signal?: AbortSignal,
  ): Promise<[SearchResponseDto | null, ApiError | null]> {
    const trimmed = (query ?? '').trim();
    if (!trimmed) {
      return [{ items: [], totalCount: 0 }, null];
    }
    const qp = new URLSearchParams();
    qp.append('q', trimmed);
    if (category && category.toLowerCase() !== 'all') {
      qp.append('category', category);
    }
    if (limit) {
      qp.append('limit', String(limit));
    }
    const qs = qp.toString();
    return clinicApiClient.get<SearchResponseDto>(`/search${qs ? `?${qs}` : ''}`, { signal });
  },

  // Dental Module (Milestone MC)
  async getPatientDentalChart(patientId: string, consultationId?: string) {
    const qs = consultationId ? `?consultationId=${consultationId}` : '';
    return clinicApiClient.get<DentalChart>(`/dental/patients/${patientId}/chart${qs}`);
  },

  async upsertToothRecord(patientId: string, payload: UpsertDentalToothRecordPayload) {
    return clinicApiClient.post<DentalToothRecord>(`/dental/patients/${patientId}/teeth`, payload);
  },

  async upsertDentalTooth(patientId: string, payload: UpsertDentalToothRecordPayload) {
    return this.upsertToothRecord(patientId, payload);
  },

  async batchSaveDentalChart(patientId: string, payload: BatchSaveDentalChartPayload) {
    return clinicApiClient.post<DentalChart>(`/dental/patients/${patientId}/chart/batch`, payload);
  },

  async saveDentalChartBatch(patientId: string, payload: BatchSaveDentalChartPayload) {
    return this.batchSaveDentalChart(patientId, payload);
  },

  async voidDentalToothRecord(patientId: string, recordId: string, reason?: string) {
    return clinicApiClient.post<DentalToothRecord>(`/dental/patients/${patientId}/teeth/${recordId}/void`, {
      reason: reason || null,
    });
  },

  async voidToothRecord(patientId: string, recordId: string, reason?: string) {
    return this.voidDentalToothRecord(patientId, recordId, reason);
  },

  // ============================================================================
  // Teleconsultation & Virtual Care API Client Methods (Milestone 5)
  // ============================================================================

  /** 1. Retrieves live teleconsult admission, payment gate status, and recording status. */
  async getTeleconsultStatus(appointmentId: string) {
    return clinicApiClient.get<TeleconsultStatusDto>(
      `/teleconsult/appointments/${encodeURIComponent(appointmentId)}/status`,
    );
  },

  /** 2. Updates the teleconsultation payment policy (Prepaid, Postpaid, Exempt). */
  async updateTeleconsultPaymentPolicy(
    appointmentId: string,
    paymentPolicy: TeleconsultPaymentPolicy | string,
  ) {
    return clinicApiClient.put<TeleconsultStatusDto>(
      `/teleconsult/appointments/${encodeURIComponent(appointmentId)}/payment-policy`,
      { paymentPolicy },
    );
  },

  /** 3. Admits patient from the virtual waiting room (with optional plain-note emergency override). */
  async admitTeleconsultPatient(
    appointmentId: string,
    emergencyOverride?: EmergencyOverrideDto | null,
  ) {
    return clinicApiClient.post<TeleconsultAdmissionResultDto>('/teleconsult/admit', {
      appointmentId,
      emergencyOverride: emergencyOverride || undefined,
    });
  },

  /** 4. Joins teleconsult call and requests zero-PHI room tokens from media broker. */
  async joinTeleconsultCall(appointmentId: string) {
    return clinicApiClient.post<TeleconsultCallJoinDto>(
      `/teleconsult/appointments/${encodeURIComponent(appointmentId)}/join`,
      {},
    );
  },

  /** 5. Ends teleconsult call, marks appointment completed, and auto-finalizes recording. */
  async endTeleconsultCall(appointmentId: string, endReason?: string) {
    return clinicApiClient.post<TeleconsultCallEndResultDto>(
      `/teleconsult/appointments/${encodeURIComponent(appointmentId)}/end`,
      endReason ? { endReason } : {},
    );
  },

  /** 6. Clinician initiates informed recording consent for a call session. */
  async requestRecordingConsent(payload: RequestRecordingConsentPayload) {
    return clinicApiClient.post<RecordingSessionDto>(
      '/teleconsult/recordings/sessions/request-consent',
      payload,
    );
  },

  /** 7. Submits patient recording consent decision (approved or declined). */
  async submitPatientRecordingConsent(
    sessionId: string,
    payload: PatientConsentPayload | { approved?: boolean; consented?: boolean; rejectionReason?: string | null; refusalReason?: string | null },
  ) {
    const approved = payload.approved ?? payload.consented ?? true;
    const rejectionReason = payload.rejectionReason ?? payload.refusalReason ?? undefined;
    return clinicApiClient.post<RecordingSessionDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/patient-consent`,
      { approved, rejectionReason },
    );
  },

  /** 8. Unilaterally revokes recording consent, halting active recording immediately. */
  async revokeRecordingConsent(sessionId: string, reason?: string) {
    return clinicApiClient.post<RecordingSessionDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/revoke-consent`,
      reason ? { reason } : {},
    );
  },

  /** 9. Streams a ~10s recording chunk for CMK AES-256-GCM envelope vault encryption. */
  async uploadRecordingSegment(
    sessionId: string,
    segmentIndexOrChunk: number | Blob | Uint8Array | ArrayBuffer,
    durationMsOrMeta?: number | { segmentIndex: number; durationMs: number; iv?: string; tag?: string },
    chunk?: Blob | Uint8Array | ArrayBuffer,
    encryptionMeta?: { iv?: string; tag?: string },
  ) {
    let segmentIndex = 0;
    let durationMs = 0;
    let payloadChunk: Blob | Uint8Array | ArrayBuffer;
    let iv: string | undefined;
    let tag: string | undefined;

    if (typeof segmentIndexOrChunk === 'number') {
      segmentIndex = segmentIndexOrChunk;
      durationMs = typeof durationMsOrMeta === 'number' ? durationMsOrMeta : 0;
      payloadChunk = chunk!;
      iv = encryptionMeta?.iv;
      tag = encryptionMeta?.tag;
    } else {
      payloadChunk = segmentIndexOrChunk;
      if (typeof durationMsOrMeta === 'object' && durationMsOrMeta !== null) {
        segmentIndex = durationMsOrMeta.segmentIndex ?? 0;
        durationMs = durationMsOrMeta.durationMs ?? 0;
        iv = durationMsOrMeta.iv;
        tag = durationMsOrMeta.tag;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Segment-Index': segmentIndex.toString(),
      'X-Segment-Duration-Ms': durationMs.toString(),
    };
    if (iv) headers['X-Encryption-Iv'] = iv;
    if (tag) headers['X-Encryption-Tag'] = tag;

    return clinicApiClient.post<RecordingSegmentDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/segments`,
      payloadChunk,
      { headers },
    );
  },

  /** 10. Finalizes recording session, creates encrypted manifest, and schedules retention. */
  async finalizeRecordingSession(sessionId: string) {
    return clinicApiClient.post<RecordingSessionDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/finalize`,
      {},
    );
  },

  /** 11. Freezes automated retention deletion by placing a medico-legal hold (Admin only). */
  async placeRecordingLegalHold(sessionId: string, reason: string) {
    return clinicApiClient.post<RecordingSessionDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/legal-hold`,
      { reason },
    );
  },

  /** 12. Releases medico-legal hold, allowing normal retention scheduling (Admin only). */
  async releaseRecordingLegalHold(sessionId: string, reason?: string) {
    return clinicApiClient.post<RecordingSessionDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/release-legal-hold`,
      reason ? { reason } : {},
    );
  },

  /** 13. Mints short-lived 15-minute signed HMAC ticket for authorized clinical playback. */
  async createRecordingPlaybackTicket(sessionId: string) {
    return clinicApiClient.post<PlaybackTicketDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/playback-ticket`,
      {},
    );
  },

  /** 14. Synchronously builds the ticketed range-streaming playback URL for video seeking. */
  buildRecordingStreamUrl(sessionId: string, ticket: string, segmentIndex?: number): string {
    const segQuery =
      segmentIndex !== undefined && segmentIndex !== null
        ? `&segmentIndex=${encodeURIComponent(segmentIndex.toString())}`
        : '';
    return clinicApiUrl(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}/stream?ticket=${encodeURIComponent(ticket)}${segQuery}`,
    );
  },

  /** 14b. Alias for buildRecordingStreamUrl. */
  getRecordingStreamUrl(sessionId: string, ticket: string, segmentIndex?: number): string {
    return this.buildRecordingStreamUrl(sessionId, ticket, segmentIndex);
  },

  /** 15. Retrieves recording metadata linked to a consultation encounter for chart display. */
  async getConsultationRecording(consultationId: string) {
    return clinicApiClient.get<RecordingSessionDto | null>(
      `/teleconsult/recordings/consultations/${encodeURIComponent(consultationId)}`,
    );
  },

  /** 16. Lists all active or completed recording sessions associated with an appointment. */
  async getAppointmentRecordings(appointmentId: string) {
    return clinicApiClient.get<RecordingSessionDto[]>(
      `/teleconsult/recordings/appointments/${encodeURIComponent(appointmentId)}`,
    );
  },

  /** 16b. Alias for getAppointmentRecordings. */
  async getAppointmentRecording(appointmentId: string) {
    return this.getAppointmentRecordings(appointmentId);
  },

  /** 17. Retrieves single recording session details by session ID. */
  async getRecordingSession(sessionId: string) {
    return clinicApiClient.get<RecordingSessionDto>(
      `/teleconsult/recordings/sessions/${encodeURIComponent(sessionId)}`,
    );
  },

  /** 18. Creates a teleconsult guest invite for browser portal access. */
  async createTeleconsultGuestInvite(appointmentId: string) {
    const [res, err] = await clinicApiClient.post<TeleconsultGuestInviteDto>(
      `/teleconsult/appointments/${encodeURIComponent(appointmentId)}/guest-invite`,
      {},
    );
    if (res && res.inviteToken) {
      const legacyHost = ['portal', 'clinicez', 'com'].join('.');
      if (
        !res.inviteUrl ||
        res.inviteUrl.includes(legacyHost) ||
        res.inviteUrl.includes('/guest/teleconsult')
      ) {
        res.inviteUrl = publicRoutes.teleconsultJoin({
          baseUrl: getPortalBaseUrl(),
          token: res.inviteToken,
        });
      }
    }
    return [res, err] as const;
  },
};

// ============================================================================
// Clinic Audit Log & Forensic Activity Trail Types (Milestone 3)
// ============================================================================

export type ClinicAuditCategory =
  | 'Security'
  | 'Operations'
  | 'Patient'
  | 'Appointments'
  | 'Queue'
  | 'Clinical'
  | 'Billing'
  | 'PhilHealth'
  | 'Audit';

export type ClinicAuditSeverity = 'Routine' | 'Urgent' | 'Emergency';

export type ClinicAuditOutcome = 'Success' | 'Failure' | 'Warning';

export type AuditDatePreset = 'today' | '24h' | '7d' | '30d' | 'all' | 'custom';

export interface ClinicAuditEntryDto {
  id: string;
  tenantId: string;
  clinicId: string;
  timestamp: string;
  category: ClinicAuditCategory | string;
  severity: ClinicAuditSeverity | string;
  action: string;
  actorStaffId?: string | null;
  actorName: string;
  actorRole: string;
  clientIpAddress?: string | null;
  userAgent?: string | null;
  targetEntityType: string;
  targetEntityId?: string | null;
  patientId?: string | null;
  patientNameMasked?: string | null;
  patientPinMasked?: string | null;
  outcome: ClinicAuditOutcome | string;
  description: string;
  metadataJson: string;
  createdAt: string;
}

export interface ClinicAuditEntryDetailDto extends ClinicAuditEntryDto {
  proseChecksums: Record<string, string>;
}

export interface AuditLogListDto {
  items: ClinicAuditEntryDto[];
  hasMore: boolean;
  nextCursor?: string | null;
  totalCount: number;
}

export interface AuditFilterParams {
  category?: string;
  severity?: string;
  action?: string;
  actorId?: string;
  entityId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  before?: string;
  pageSize?: number;
}

export interface AuditExportParams {
  format?: 'csv' | 'json';
  category?: string;
  severity?: string;
  action?: string;
  actorId?: string;
  entityId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface LabOrderSlipData {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  clinicName: string;
  clinicAddress: string;
  clinicContact: string;
  doctorName: string;
  doctorPrcLicense: string;
  doctorPtr?: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  philHealthNumber?: string;
  clinicalDiagnosis?: string;
  fastingInstructions?: string;
  items: { testName: string; category: string; instructions?: string }[];
  publicUploadUrl: string;
  qrPayload: string;
}

export interface PrescriptionSlipItem {
  itemId: string;
  genericName: string;
  brandName?: string;
  dosage: string;
  form: string;
  sig: string;
  quantity: number;
  durationDays?: number;
  refills: number;
  isDangerousDrug: boolean;
  remarks?: string;
  uniquePrescriptionSecurityCode?: string;
  isGamotCovered?: boolean;
  philHealthDrugCode?: string;
  isClinicDispensed?: boolean;
  clinicDispensedQuantity?: number | null;
}

export interface PrescriptionSlipData {
  consultationId: string;
  prescriptionNumber: string;
  issuedAt: string;
  clinicName: string;
  clinicAddress: string;
  clinicContact: string;
  doctorName: string;
  doctorPrcLicense: string;
  doctorPtr?: string;
  doctorS2License?: string;
  doctorSpecialization?: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  philHealthNumber?: string;
  patientAllergies?: string;
  clinicalDiagnosis?: string;
  specialInstructions?: string;
  isPhilHealthGamot?: boolean;
  gamotCoverageAmount?: number;
  items: PrescriptionSlipItem[];
  publicVerificationToken: string;
  publicVerificationUrl: string;
  qrPayload: string;
  dispenseStatus: string;
  dispensedPharmacyName?: string;
  dispensedPharmacistName?: string;
  dispensedPharmacistPrc?: string;
  dispensedReceiptNumber?: string;
  dispensedReceiptUrl?: string;
  dispensedAt?: string;
  dispenseNotes?: string;
  /** Where the prescription stands at the pharmacy, as last reported by it. */
  pharmacyStatus?: RxPharmacyStatus | null;
}

export type RxStage = 'Issued' | 'Accepted' | 'PartiallyAccepted' | 'Rejected' | 'Dispensed' | 'ExternalDispensed';

export interface RxPharmacyStatus {
  stage: RxStage;
  reason?: string | null;
  quotedAmount?: number | null;
  pharmacyName?: string | null;
  reportedAt?: string | null;
}

export interface RecordExternalDispensePayload {
  externalPharmacyName: string;
  externalBranchLocation?: string;
  pharmacistName?: string;
  pharmacistPrcLicense?: string;
  officialReceiptNumber?: string;
  receiptDocumentUrl?: string;
  notes?: string;
}

export type YakapTransmittalStatus = 'Draft' | 'Validated' | 'Submitted' | 'Approved' | 'Failed';

export interface YakapTransmittalItem {
  id: string;
  transmittalId: string;
  patientId: string;
  patientName: string;
  philHealthIdentificationNumber: string;
  consultationEncounterId?: string;
  itemType: 'Enlistment' | 'Profile' | 'Soap';
  reportStatus: 'U' | 'A' | 'D' | 'V' | 'F';
  deficiencyRemarks?: string;
  processedAt?: string;
}

export interface YakapTransmittal {
  id: string;
  transmittalNumber: string;
  reportTagging: '1' | '2';
  effectiveYear: string;
  packageType: string;
  status: YakapTransmittalStatus;
  totalEnlistments: number;
  totalProfiles: number;
  totalSoaps: number;
  totalMedicines: number;
  philHealthTransactionNumber?: string;
  validationErrors?: string[];
  rawXmlPayload?: string;
  encryptedPayloadHash?: string;
  transmittedAt?: string;
  validatedAt?: string;
  notes?: string;
  createdAt: string;
  items: YakapTransmittalItem[];
}

export interface EligibleYakapEncounter {
  encounterId: string;
  patientId: string;
  patientName: string;
  philHealthIdentificationNumber?: string;
  encounterDate: string;
  doctorName: string;
  primaryDiagnosis: string;
  diagnosesCount: number;
  prescriptionsCount: number;
  diagnosticsCount: number;
  isYakapEligible: boolean;
  hasPhilHealthPin: boolean;
  totalMedicationAmount: number;
}

export interface CreateYakapTransmittalPayload {
  reportTagging: '1' | '2';
  effectiveYear?: string;
  packageType?: string;
  consultationEncounterIds?: string[];
  encounterIds?: string[];
  notes?: string;
}

export interface PinValidationResult {
  isValid: boolean;
  formattedPin: string;
  failureReason?: string;
}

export type SoapSimulationScenario =
  | 'HappyPath'
  | 'DtdValidationError'
  | 'ExpiredToken'
  | 'InvalidPin'
  | 'NetworkTimeout'
  | 'SoapFault500';

export type SoapSimulationStepStatus =
  | 'Pending'
  | 'Running'
  | 'Passed'
  | 'Failed'
  | 'Skipped';

export interface SoapSimulationStepResult {
  stepNumber: number;
  actionName: string;
  status: SoapSimulationStepStatus | number;
  durationMs: number;
  summary: string;
  requestXml?: string;
  responseXml?: string;
  errorMessage?: string;
}

export interface SoapSimulationReport {
  scenario: SoapSimulationScenario | number;
  passed: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalDurationMs: number;
  steps: SoapSimulationStepResult[];
  timestamp: string;
}

export interface SoapSandboxStatus {
  isActive: boolean;
  activeScenario: SoapSimulationScenario | number;
  endpointUrl: string;
  totalSimulatedCalls: number;
  availableScenarios: string[];
}

export interface YakapMasterlistAssignment {
  philHealthIdentificationNumber: string;
  memberPhilHealthIdentificationNumber?: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  extensionName?: string;
  birthDate: string;
  gender: string;
  packageType: string;
  registrationDate: string;
  effectivityYear: string;
}

export interface PhilHealthConditionEntry {
  code: string;
  specificDesc?: string;
}

export interface PhilHealthSurgicalEntry {
  procedureDesc: string;
  procedureDate?: string;
}

export interface PhilHealthPatientProfile {
  pin?: string;
  memberPin?: string;
  memberType?: string;
  memberLastName?: string;
  memberFirstName?: string;
  memberMiddleName?: string;
  memberSuffix?: string;
  memberBirthDate?: string;
  dependentRelationship?: string;
  atc?: string;
  isWalkedIn?: string;
  bloodType?: string;

  medicalHistories: PhilHealthConditionEntry[];
  surgicalHistories: PhilHealthSurgicalEntry[];
  familyHistories: PhilHealthConditionEntry[];

  medicalHistoryNotes?: string;
  familyHistoryNotes?: string;

  isSmoker: boolean;
  smokingStatus?: 'never' | 'current' | 'quit' | string;
  cigarettesPerDay?: string;
  packsPerDay?: string;
  yearsSmoking?: string;
  smokingPackYears?: string;
  smokingStoppedDate?: string;
  isAlcoholDrinker: boolean;
  alcoholStatus?: 'never' | 'current' | 'quit' | string;
  bottlesPerDay?: string;
  alcoholDrinksPerWeek?: string;
  alcoholFrequency?: string;
  illDrugUser: boolean;
  drugTypes?: string;
  substanceUseHistory?: string;
  isSexuallyActive: boolean;
  physicalActivityFrequency?: string;
  dietaryHabits?: string;
  remarks?: string;

  childImmunizations: string[];
  youngWomanImmunizations: string[];
  pregnantWomanImmunizations: string[];
  elderlyImmunizations: string[];
  otherImmunizations: string[];

  menstrualApplicable: boolean;
  menarcheAge?: string;
  lastMensPeriod?: string;
  periodDurationDays?: string;
  cycleIntervalDays?: string;
  padsPerDay?: string;
  coitarcheAge?: string;
  birthControlMethod?: string;
  isMenopause: boolean;
  menopauseAge?: string;

  pregnancyApplicable: boolean;
  gravida: number;
  para: number;
  deliveryType?: string;
  fullTermCount: number;
  prematureCount: number;
  abortionCount: number;
  livingChildrenCount: number;
  preEclampsiaHypertension: boolean;
  familyPlanningCounseling: boolean;

  systolic?: string;
  diastolic?: string;
  heartRate?: string;
  respiratoryRate?: string;
  temperature?: string;
  heightCm?: string;
  weightKg?: string;
  bmi?: string;
  waistCm?: string;
  hipCm?: string;
  lengthCm?: string;
  headCircCm?: string;
  skinfoldThicknessMm?: string;
  muacCm?: string;
  zScore?: string;
  visualAcuityLeft?: string;
  visualAcuityRight?: string;

  skinId: string;
  skinRemarks?: string;
  heentId: string;
  heentRemarks?: string;
  chestId: string;
  chestRemarks?: string;
  heartId: string;
  heartRemarks?: string;
  abdomenId: string;
  abdomenRemarks?: string;
  neuroId: string;
  neuroRemarks?: string;
  rectalId: string;
  rectalRemarks?: string;
  guId: string;
  guRemarks?: string;

  genSurveyId: string;
  genSurveyRemarks?: string;

  ncdAnswers: Record<string, string>;

  lastUpdatedAt?: string;
  updatedBy?: string;
}

export interface GamotLedgerTransaction {
  id: string;
  prescriptionOrderId: string;
  prescriptionOrderItemId?: string;
  prescriptionNumber: string;
  transactionDate: string;
  philHealthDrugCode: string;
  genericName: string;
  brandName?: string;
  quantityDispensed: number;
  philHealthReferencePrice: number;
  totalGamotAmount: number;
  patientCoPay: number;
  uniquePrescriptionSecurityCode: string;
  dispensingPharmacistName: string;
  dispensingPharmacistPrc: string;
  hciAccreditationNumber: string;
  status: 'Allocated' | 'Dispensed' | 'Claimed' | 'Reversed' | 'Rejected';
  notes?: string;
}

export interface GamotBeneficiaryLedger {
  id: string;
  patientName: string;
  philHealthIdentificationNumber: string;
  memberPhilHealthIdentificationNumber?: string;
  benefitYear: string;
  annualAllocation: number;
  totalAmountUtilized: number;
  remainingBalance: number;
  transactions: GamotLedgerTransaction[];
}

export interface GamotFormularyItem {
  drugCode: string;
  genericName: string;
  dosage: string;
  form: string;
  therapeuticCategory: string;
  referenceUnitPrice: number;
  requiresSpecialistRecommendation: boolean;
}

export interface UpscGenerateResult {
  uniquePrescriptionSecurityCode: string;
  prescriptionNumber: string;
  drugCode: string;
  generatedAt: string;
}

export interface UpscVerifyResult {
  isValid: boolean;
  failureReason?: string;
  uniquePrescriptionSecurityCode: string;
}

export interface GenerateUpscPayload {
  prescriptionOrderId: string;
  prescriptionOrderItemId: string;
  hciAccreditationNumber: string;
}

export interface ValidateUpscPayload {
  uniquePrescriptionSecurityCode: string;
  hciAccreditationNumber?: string;
  philHealthIdentificationNumber?: string;
  prescriptionNumber?: string;
  doctorPrcLicense?: string;
  drugCode?: string;
  quantity?: number;
  issueDate?: string;
}

export interface DispenseGamotPayload {
  prescriptionOrderId: string;
  pharmacistName: string;
  pharmacistPrcLicense: string;
  hciAccreditationNumber: string;
  receiptNumber?: string;
  notes?: string;
  manualBatchSelections?: Array<{
    itemId: string;
    batchId: string;
    quantity: number;
  }>;
}

export interface ReverseGamotPayload {
  reason: string;
  reversedBy: string;
}

export interface PhilHealthCredentialPayload {
  facilityName: string;
  accreditationNumber: string;
  pmccNumber?: string;
  softwareCertificateId?: string;
  username: string;
  password?: string;
  cipherKey?: string;
  konsultaEndpoint?: string;
}

export interface PhilHealthConfigStatus {
  tenantId: string;
  facilityName: string;
  accreditationNumber: string;
  pmccNumber?: string;
  softwareCertificateId?: string;
  konsultaEndpoint: string;
  isConfigured: boolean;
  isActive: boolean;
  updatedAt?: string;
}

// ============================================================================
// Multi-Room Staff Assignment & Scoped Station Routing Pure Domain Helpers
// ============================================================================

export interface ScopedStationConfig {
  visibleRooms: ClinicRoom[];
  allPillLabel: string;
  defaultStationId?: string;
  defaultStationName?: string;
}

/**
 * Computes visible station rooms and labels based on clinician role and assignedRoomIds
 */
export function computeScopedStations(
  activeRooms: ClinicRoom[],
  currentStaff: StaffMember | null,
  activeView?: QueueView,
): ScopedStationConfig {
  if (!currentStaff) {
    if (activeView === 'PendingProcedure') {
      const treatmentRooms = activeRooms.filter((r) => r.type === 'Treatment');
      return {
        visibleRooms: treatmentRooms.length > 0 ? treatmentRooms : activeRooms,
        allPillLabel: 'All Procedure Stations',
      };
    }
    if (activeView === 'Triage') {
      const triageRooms = activeRooms.filter((r) => r.type === 'Triage');
      return {
        visibleRooms: triageRooms.length > 0 ? triageRooms : activeRooms,
        allPillLabel: 'All Triage Stations',
      };
    }
    return { visibleRooms: activeRooms, allPillLabel: 'All Stations' };
  }

  const assignedIds = currentStaff.assignedRoomIds ?? (currentStaff.assignedRoomId ? [currentStaff.assignedRoomId] : []);
  const isDoctor = currentStaff.role === 'Doctor';
  const isNurse = currentStaff.role === 'Nurse';

  // 1. "My Room" View: Show strictly clinician's assigned rooms
  if (activeView === 'MyRoom') {
    if (assignedIds.length > 0) {
      const myRooms = activeRooms.filter((r) => assignedIds.includes(r.id));
      return {
        visibleRooms: myRooms.length > 0 ? myRooms : activeRooms,
        allPillLabel: isDoctor ? 'All My Rooms' : 'All My Stations',
        defaultStationId: assignedIds[0],
        defaultStationName: activeRooms.find((r) => r.id === assignedIds[0])?.name,
      };
    }
    const consultRooms = activeRooms.filter((r) => r.type === 'Consultation');
    return {
      visibleRooms: consultRooms.length > 0 ? consultRooms : activeRooms,
      allPillLabel: 'All Rooms',
    };
  }

  // 2. "Pending Procedure" View: Show Treatment / Procedure stations only
  if (activeView === 'PendingProcedure') {
    const treatmentRooms = activeRooms.filter((r) => r.type === 'Treatment');
    const roomsToShow = treatmentRooms.length > 0 ? treatmentRooms : activeRooms;
    const assignedTx = roomsToShow.find((r) => assignedIds.includes(r.id));
    return {
      visibleRooms: roomsToShow,
      allPillLabel: 'All Procedure Stations',
      defaultStationId: assignedTx?.id ?? roomsToShow[0]?.id,
      defaultStationName: assignedTx?.name ?? roomsToShow[0]?.name,
    };
  }

  // 3. "Triage" View: Show Triage stations only
  if (activeView === 'Triage') {
    const triageRooms = activeRooms.filter((r) => r.type === 'Triage');
    const roomsToShow = triageRooms.length > 0 ? triageRooms : activeRooms;
    const assignedTriage = roomsToShow.find((r) => assignedIds.includes(r.id));
    return {
      visibleRooms: roomsToShow,
      allPillLabel: 'All Triage Stations',
      defaultStationId: assignedTriage?.id ?? roomsToShow[0]?.id,
      defaultStationName: assignedTriage?.name ?? roomsToShow[0]?.name,
    };
  }

  // 4. Default / "WaitingForDoctor" / "All" View
  if (isDoctor && assignedIds.length > 0) {
    const visible = activeRooms.filter(
      (r) => assignedIds.includes(r.id) || r.type === 'Triage' || r.type === 'Treatment',
    );
    return {
      visibleRooms: visible,
      allPillLabel: 'All My Stations',
      defaultStationId: assignedIds[0],
      defaultStationName: activeRooms.find((r) => r.id === assignedIds[0])?.name,
    };
  }

  if (isNurse && assignedIds.length > 0) {
    const visible = activeRooms.filter(
      (r) => assignedIds.includes(r.id) || r.type === 'Triage' || r.type === 'Treatment',
    );
    const defaultRoom = activeRooms.find((r) => r.id === assignedIds[0]);
    return {
      visibleRooms: visible,
      allPillLabel: 'All Stations',
      defaultStationId: defaultRoom?.id,
      defaultStationName: defaultRoom?.name,
    };
  }

  return {
    visibleRooms: activeRooms,
    allPillLabel: 'All Stations',
  };
}

/**
 * Queue patient visibility filtering by doctor's scoped rooms
 */
export function isPatientVisibleToStaff(
  patient: PatientQueueItem,
  currentStaff: StaffMember | null,
  activeRooms: ClinicRoom[],
): boolean {
  if (!currentStaff || currentStaff.role !== 'Doctor') return true;
  const assignedIds = currentStaff.assignedRoomIds ?? (currentStaff.assignedRoomId ? [currentStaff.assignedRoomId] : []);
  if (assignedIds.length === 0) return true;

  if (patient.doctorId === currentStaff.id) return true;

  const patientRoom = activeRooms.find(
    (r) => r.id === patient.roomId || r.name.toLowerCase() === patient.roomOrStation?.toLowerCase(),
  );

  if (patientRoom && patientRoom.type === 'Consultation') {
    return assignedIds.includes(patientRoom.id);
  }

  return true;
}

/**
 * 4-Step Call-to-Room Resolution Algorithm
 * 1. Active station pill if valid (not 'ALL' and matches an active visible room)
 * 2. Ticket's check-in room if contained in clinician's assigned rooms
 * 3. Clinician's primary assigned room (assignedRoomIds[0])
 * 4. First available active consultation room (fallback)
 */
export function resolveCallToRoom({
  ticket,
  selectedStation,
  currentStaff,
  activeRooms,
  visibleRooms,
}: {
  ticket: PatientQueueItem;
  selectedStation: string;
  currentStaff: StaffMember | null;
  activeRooms: ClinicRoom[];
  visibleRooms: ClinicRoom[];
}): { roomName: string; roomId?: string } {
  const assignedIds = currentStaff?.assignedRoomIds ?? (currentStaff?.assignedRoomId ? [currentStaff.assignedRoomId] : []);

  // Step 1: Active station pill if valid (selectedStation !== 'ALL' and matches visible active room)
  if (selectedStation !== 'ALL') {
    const matchingStation = visibleRooms.find(
      (r) => r.id === selectedStation || r.name.toLowerCase() === selectedStation.toLowerCase(),
    );
    if (matchingStation) {
      return { roomName: matchingStation.name, roomId: matchingStation.id };
    }
  }

  // Step 2: Ticket's check-in room if contained in clinician's assigned rooms
  if (ticket.roomId && assignedIds.includes(ticket.roomId)) {
    const match = activeRooms.find((r) => r.id === ticket.roomId);
    if (match) return { roomName: match.name, roomId: match.id };
  }
  if (ticket.roomOrStation) {
    const match = activeRooms.find(
      (r) => r.name.toLowerCase() === ticket.roomOrStation?.toLowerCase() && assignedIds.includes(r.id),
    );
    if (match) return { roomName: match.name, roomId: match.id };
  }

  // Step 3: Clinician's primary assigned room (assignedRoomIds[0])
  if (assignedIds.length > 0) {
    const primary = activeRooms.find((r) => r.id === assignedIds[0]);
    if (primary) return { roomName: primary.name, roomId: primary.id };
  }

  // Step 4: First available active consultation room fallback
  const firstConsult = activeRooms.find((r) => r.type === 'Consultation') || activeRooms[0];
  if (firstConsult) {
    return { roomName: firstConsult.name, roomId: firstConsult.id };
  }

  return { roomName: 'Room 1' };
}

/**
 * Staff assignment coverage text in Room Settings card
 */
export function getOtherRoomCoverageText(
  member: StaffMember,
  targetRoomId: string | undefined,
  sortedRooms: ClinicRoom[],
  isSelected: boolean,
): string {
  const memberRoomIds = member.assignedRoomIds ?? (member.assignedRoomId ? [member.assignedRoomId] : []);
  const otherRooms = sortedRooms.filter(
    (r) => (!targetRoomId || r.id !== targetRoomId) && memberRoomIds.includes(r.id),
  );
  const otherRoomNames = otherRooms.map((r) => r.name).join(', ');

  if (otherRoomNames) {
    return isSelected
      ? `Also in ${otherRoomNames} · Will cover both`
      : `Currently in ${otherRoomNames}`;
  }

  return isSelected ? 'Assigned to this room' : 'Unassigned / Floating';
}

/**
 * Walk-in attending doctor room preselection and badging
 */
export function resolveWalkInDoctorRoomSelection(
  doctor: StaffMember | null,
  activeRooms: ClinicRoom[],
): { preselectedRoomId?: string; doctorRoomIds: string[] } {
  const doctorRoomIds = doctor?.assignedRoomIds ?? (doctor?.assignedRoomId ? [doctor.assignedRoomId] : []);
  if (!doctor || doctorRoomIds.length === 0) {
    return { preselectedRoomId: undefined, doctorRoomIds: [] };
  }

  const validRooms = doctorRoomIds.filter((id) => activeRooms.some((r) => r.id === id));
  return {
    preselectedRoomId: validRooms[0],
    doctorRoomIds: validRooms,
  };
}

export type ClinicTimeFormat = '12h' | '24h';

export interface ClinicRegionalConfig {
  timeZoneId: string;
  dateFormat: string;
  timeFormat: ClinicTimeFormat;
}

export const CLINIC_DATE_FORMAT_OPTIONS = [
  { value: 'MMM d, yyyy', example: 'Oct 22, 2026', label: 'Month Day, Year' },
  { value: 'd MMM yyyy', example: '22 Oct 2026', label: 'Day Month Year' },
  { value: 'dd/MM/yyyy', example: '22/10/2026', label: 'DD/MM/YYYY' },
  { value: 'MM/dd/yyyy', example: '10/22/2026', label: 'MM/DD/YYYY' },
  { value: 'yyyy-MM-dd', example: '2026-10-22', label: 'ISO (YYYY-MM-DD)' },
] as const;

export const CLINIC_TIME_FORMAT_OPTIONS: Array<{
  value: ClinicTimeFormat;
  label: string;
  example: string;
  description: string;
}> = [
  {
    value: '12h',
    label: '12-Hour (AM / PM)',
    example: '08:45 AM',
    description: 'Standard 12-hour clock with AM/PM period indicator',
  },
  {
    value: '24h',
    label: '24-Hour (Clinical / Military)',
    example: '14:45',
    description: '24-hour clinical clock (00:00 – 23:59) without AM/PM',
  },
];

export const CLINIC_COMMON_TIMEZONES = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
] as const;

let activeClinicTimeZoneId = 'Asia/Manila';
let activeClinicDateFormat = 'MMM d, yyyy';
let activeClinicTimeFormat: ClinicTimeFormat = '12h';

/**
 * Sets the active clinic/workspace IANA time zone ID (e.g. from ClinicSettings.timeZoneId or WorkspaceProfile.timeZoneId).
 * Falls back to 'Asia/Manila' when null or empty.
 */
export function setClinicTimeZoneId(timeZoneId?: string | null): void {
  const trimmed = timeZoneId?.trim();
  activeClinicTimeZoneId = trimmed || 'Asia/Manila';
}

/**
 * Returns the currently configured clinic/workspace IANA time zone ID (defaults to 'Asia/Manila').
 */
export function getClinicTimeZoneId(): string {
  return activeClinicTimeZoneId || 'Asia/Manila';
}

/**
 * Sets the active clinic/workspace date format pattern (e.g. 'MMM d, yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd').
 */
export function setClinicDateFormat(dateFormat?: string | null): void {
  const trimmed = dateFormat?.trim();
  activeClinicDateFormat = trimmed || 'MMM d, yyyy';
}

/**
 * Returns the currently configured clinic/workspace date format pattern (defaults to 'MMM d, yyyy').
 */
export function getClinicDateFormat(): string {
  return activeClinicDateFormat || 'MMM d, yyyy';
}

/**
 * Sets the active clinic time format ('12h' or '24h').
 */
export function setClinicTimeFormat(timeFormat?: string | null): void {
  const trimmed = timeFormat?.trim().toLowerCase();
  activeClinicTimeFormat = trimmed === '24h' || trimmed === 'hh:mm' ? '24h' : '12h';
}

/**
 * Returns the currently configured clinic time format ('12h' or '24h').
 */
export function getClinicTimeFormat(): ClinicTimeFormat {
  return activeClinicTimeFormat || '12h';
}

/**
 * Updates all three active clinic regional settings at once.
 */
export function setClinicRegionalConfig(config: {
  timeZoneId?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
}): void {
  if (config.timeZoneId !== undefined) setClinicTimeZoneId(config.timeZoneId);
  if (config.dateFormat !== undefined) setClinicDateFormat(config.dateFormat);
  if (config.timeFormat !== undefined) setClinicTimeFormat(config.timeFormat);
}

export function getClinicRegionalConfig(): ClinicRegionalConfig {
  return {
    timeZoneId: getClinicTimeZoneId(),
    dateFormat: getClinicDateFormat(),
    timeFormat: getClinicTimeFormat(),
  };
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a date or timestamp according to the active clinic/workspace timezone and dateFormat.
 * Pure calendar strings ('YYYY-MM-DD') are formatted without timezone day-shifting.
 */
export function formatClinicDate(
  input: string | Date | number | null | undefined,
  options?: { dateFormat?: string; timeZoneId?: string; fallback?: string }
): string {
  const fallback = options?.fallback ?? '—';
  if (input === null || input === undefined || input === '') return fallback;

  const targetFormat = options?.dateFormat?.trim() || activeClinicDateFormat || 'MMM d, yyyy';
  const targetTz = options?.timeZoneId?.trim() || activeClinicTimeZoneId || 'Asia/Manila';

  let year: number;
  let month: number; // 1-12
  let day: number;   // 1-31

  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const [y, m, d] = input.trim().split('-').map(Number);
    if (!y || !m || !d) return fallback;
    year = y;
    month = m;
    day = d;
  } else {
    const dateObj = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(dateObj.getTime())) return fallback;

    const ymd = getClinicTodayStr(dateObj, targetTz);
    const [y, m, d] = ymd.split('-').map(Number);
    year = y;
    month = m;
    day = d;
  }

  const monthShort = SHORT_MONTHS[month - 1] || 'Jan';
  const month2 = String(month).padStart(2, '0');
  const day2 = String(day).padStart(2, '0');

  switch (targetFormat) {
    case 'd MMM yyyy':
      return `${day} ${monthShort} ${year}`;
    case 'dd/MM/yyyy':
      return `${day2}/${month2}/${year}`;
    case 'MM/dd/yyyy':
      return `${month2}/${day2}/${year}`;
    case 'yyyy-MM-dd':
      return `${year}-${month2}-${day2}`;
    case 'MMM d, yyyy':
    default:
      return `${monthShort} ${day}, ${year}`;
  }
}

/**
 * Formats a timestamp or Date object (or 'HH:mm' string) according to the active clinic timezone and timeFormat ('12h' or '24h').
 */
export function formatClinicTime(
  input: string | Date | number | null | undefined,
  options?: { timeFormat?: string; timeZoneId?: string; fallback?: string; includeSeconds?: boolean }
): string {
  const fallback = options?.fallback ?? '—';
  if (input === null || input === undefined || input === '') return fallback;

  const targetTimeFormat = (options?.timeFormat?.trim().toLowerCase() || activeClinicTimeFormat || '12h') === '24h' ? '24h' : '12h';
  const targetTz = options?.timeZoneId?.trim() || activeClinicTimeZoneId || 'Asia/Manila';

  // Handle raw 'HH:mm' or 'HH:mm:ss' strings
  if (typeof input === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(input.trim())) {
    const parts = input.trim().split(':').map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    if (targetTimeFormat === '24h') {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  }

  const dateObj = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dateObj.getTime())) return fallback;

  const is12h = targetTimeFormat !== '24h';
  const formatOpts: Intl.DateTimeFormatOptions = {
    timeZone: targetTz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: is12h,
    ...(options?.includeSeconds ? { second: '2-digit' } : {}),
  };

  try {
    return new Intl.DateTimeFormat('en-US', formatOpts).format(dateObj);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: is12h,
    }).format(dateObj);
  }
}

/**
 * Formats an ISO timestamp or Date into both date and time using the clinic's active timezone, dateFormat, and timeFormat.
 */
export function formatClinicDateTime(
  input: string | Date | number | null | undefined,
  options?: {
    dateFormat?: string;
    timeFormat?: string;
    timeZoneId?: string;
    separator?: string;
    fallback?: string;
    includeSeconds?: boolean;
  }
): string {
  const fallback = options?.fallback ?? '—';
  if (input === null || input === undefined || input === '') return fallback;

  const dateObj = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dateObj.getTime())) return fallback;

  const dStr = formatClinicDate(dateObj, {
    dateFormat: options?.dateFormat,
    timeZoneId: options?.timeZoneId,
    fallback,
  });
  const tStr = formatClinicTime(dateObj, {
    timeFormat: options?.timeFormat,
    timeZoneId: options?.timeZoneId,
    fallback,
    includeSeconds: options?.includeSeconds,
  });

  if (dStr === fallback || tStr === fallback) return fallback;
  return `${dStr}${options?.separator ?? ', '}${tStr}`;
}

/**
 * Returns today's calendar date (YYYY-MM-DD) in the configured clinic/workspace timezone
 * (falling back to 'Asia/Manila', UTC+8).
 * Prevents UTC midnight rollover mismatches where UTC is still on the previous calendar day.
 */
export function getClinicTodayStr(now: Date = new Date(), timeZoneId?: string): string {
  const targetTz = timeZoneId?.trim() || activeClinicTimeZoneId || 'Asia/Manila';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: targetTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch {
      const manilaOffsetMs = 8 * 60 * 60 * 1000;
      const manilaDate = new Date(now.getTime() + manilaOffsetMs);
      return manilaDate.toISOString().split('T')[0];
    }
  }
}

/**
 * Alias for `getClinicTodayStr` — returns today's calendar date (YYYY-MM-DD) in the configured
 * clinic/workspace timezone (defaulting to Philippine Standard Time, Asia/Manila).
 */
export function getManilaTodayStr(now: Date = new Date(), timeZoneId?: string): string {
  return getClinicTodayStr(now, timeZoneId);
}





