import type { AxiosRequestConfig } from 'axios';
import { clinicApiClient, clinicApiUrl } from './apiClient';
import { SyncStatus } from '@shared/safe';

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
  | 'OnHold';
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
  isActive: boolean;
  createdAt: string;
  hasCredentials?: boolean;
  mustChangePassword?: boolean;
  temporaryPassword?: string | null;
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
}

export interface ResetStaffPasswordResult {
  staffId: string;
  staffName: string;
  email: string;
  temporaryPassword: string;
  message: string;
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
  remarks?: string;
  philHealthDrugCode?: string;
}

export interface ConsultationRecord {
  id: string;
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
}

export interface DoctorAvailabilityData {
  doctorId: string;
  doctorName: string;
  date: string;
  isOnDuty: boolean;
  nonAvailabilityReason?: string;
  slots: AvailableSlotItem[];
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
  patientId: string;
  patientName: string;
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
 * Redeem a patient's share: a scanned QR / pasted token, or (leave `shareToken` out) the patient's ClinicEZ ID plus the
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
  personalMedicalHistoryNotes?: string | null;
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
  familyMedicalHistoryNotes?: string | null;
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
  assessedByStaffId?: string;
  assessedByStaffName?: string;
  eatsProcessedFoodWeekly?: boolean;
  threeServingsVegetablesDaily?: boolean;
  twoToThreeServingsFruitDaily?: boolean;
  physicalActivityAtLeast150MinsWeekly?: boolean;
  diagnosedDiabetes?: string | boolean;
  hasPolyphagia?: boolean;
  hasPolydipsia?: boolean;
  hasPolyuria?: boolean;
  diabetesMedicationStatus?: string;
  hasRaisedBloodGlucose?: boolean;
  fastingBloodSugarMgDl?: number;
  fastingBloodSugarMmolL?: number;
  fastingBloodSugarDate?: string;
  hasChestPain?: boolean;
  painInCenterOfChestOrLeftArm?: boolean;
  painWhenWalkingUphill?: boolean;
  slowsDownWhenPainOccurs?: boolean;
  painRelievedWithin10Mins?: boolean;
  painRelievedByNitrates?: boolean;
  severeChestPainOver30Mins?: boolean;
  transientNeurologicalDeficits?: boolean;
  hasRaisedBloodLipids?: boolean;
  totalCholesterolMgDl?: number;
  totalCholesterolDate?: string;
  hasHistoryAnginaHeartAttack?: boolean;
  hasHistoryStrokeOrTia?: boolean;
  urineKetonesPresent?: boolean;
  urineKetonesValue?: string;
  urineKetonesDate?: string;
  urineProteinPresent?: boolean;
  urineProteinValue?: string;
  urineProteinDate?: string;
  riskBand: 'BandA' | 'BandB' | 'BandC' | 'BandD' | 'BandE';
  calculatedRiskScorePercent?: number;
  remarks?: string;
  createdAt: string;
}

export interface SaveNcdRiskAssessmentPayload {
  consultationEncounterId?: string;
  assessedByStaffId?: string;
  assessedByStaffName?: string;
  eatsProcessedFoodWeekly?: boolean;
  threeServingsVegetablesDaily?: boolean;
  twoToThreeServingsFruitDaily?: boolean;
  physicalActivityAtLeast150MinsWeekly?: boolean;
  diagnosedDiabetes?: string | boolean;
  hasPolyphagia?: boolean;
  hasPolydipsia?: boolean;
  hasPolyuria?: boolean;
  diabetesMedicationStatus?: string;
  hasRaisedBloodGlucose?: boolean;
  fastingBloodSugarMgDl?: number;
  fastingBloodSugarMmolL?: number;
  fastingBloodSugarDate?: string;
  hasChestPain?: boolean;
  painInCenterOfChestOrLeftArm?: boolean;
  painWhenWalkingUphill?: boolean;
  slowsDownWhenPainOccurs?: boolean;
  painRelievedWithin10Mins?: boolean;
  painRelievedByNitrates?: boolean;
  severeChestPainOver30Mins?: boolean;
  transientNeurologicalDeficits?: boolean;
  hasRaisedBloodLipids?: boolean;
  totalCholesterolMgDl?: number;
  totalCholesterolDate?: string;
  hasHistoryAnginaHeartAttack?: boolean;
  hasHistoryStrokeOrTia?: boolean;
  urineKetonesPresent?: boolean;
  urineKetonesValue?: string;
  urineKetonesDate?: string;
  urineProteinPresent?: boolean;
  urineProteinValue?: string;
  urineProteinDate?: string;
  riskBand?: string;
  calculatedRiskScorePercent?: number;
  remarks?: string;
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
  gender: string;
  lengthOrHeightCm: number;
  weightKg: number;
  isMeasuredRecumbent?: boolean;
  assessmentDate?: string;
}

export interface PatientDemographics {
  dob?: string;
  dateOfBirth?: string;
  age: number;
  gender: string;
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
  injectionSite: string;
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
  injectionSite: string;
  administeredAtUtc: string; // ISO
  administeredByStaffId: string;
  administeredByStaffName: string;
  administeredByPrcLicense?: string | null;
  remarks?: string | null;
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
}

export interface ClinicPatient {
  id: string;
  tenantId: string;
  clinicId: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  fullName: string;
  dateOfBirth: string;
  age: number;
  gender: string;
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
  pastMedicalHistories?: MedicalHistoryItemPayload[];
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
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  dateOfBirth: string;
  gender: string;
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
  sendToTriage?: boolean;
  priority?: 'Routine' | 'Urgent' | 'Emergency' | 'Normal';
  chiefComplaint?: string;
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
}

export interface MedicalCertificateRecord {
  id: string;
  tenantId: string;
  clinicId: string;
  certificateNumber: string;
  patientId: string;
  patientName: string;
  consultationId?: string;
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
  createdAt: string;
}

export interface DocumentVerificationResult {
  isVerified: boolean;
  documentType: string;
  documentNumber: string;
  facilityName: string;
  facilityAddress: string;
  patientMaskedName: string;
  doctorName: string;
  doctorPrcLicense: string;
  issueDate: string;
  status: string;
  securityDigest: string;
  verificationMessage: string;
  notes?: string;
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
  preferredChartLayout?: 'modal' | 'split' | 'drawer';
  isJoinEnabled?: boolean;
  joinCode?: string | null;
  joinCodeExpiresAt?: string | null;
  clearJoinCode?: boolean;
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
  primaryLogoUrl?: string | null;
  primaryColorHex?: string;
}

export type NotificationUrgency = 'Routine' | 'Urgent' | 'Stat';
export type StaffNotificationCategory = 'LabResult' | 'Queue' | 'ClinicalAlert' | 'System';

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
}

export interface CreateInvoiceRequest {
  patientId: string;
  patientName: string;
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
  }>;
}

export interface RecordPaymentRequest {
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
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

  async callQueueItem(id: string, doctorId?: string, doctorName?: string, roomOrStation?: string, roomId?: string) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/call`, { doctorId, doctorName, roomOrStation, roomId });
  },

  async completeQueueItem(id: string) {
    return clinicApiClient.post<boolean>(`/queue/${id}/complete`);
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

  // Appointments
  async getAppointments(date?: string, status?: AppointmentStatus) {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (status) params.append('status', status);
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

  getPrescriptionSlipPdfUrl(consultationId: string) {
    return clinicApiUrl(`/prescriptions/${consultationId}/slip-pdf`);
  },

  getPrescriptionSlipPdfByNumberUrl(prescriptionNumber: string) {
    return clinicApiUrl(`/prescriptions/by-number/${encodeURIComponent(prescriptionNumber)}/slip-pdf`);
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

  async recordPayment(invoiceId: string, payload: RecordPaymentRequest) {
    return clinicApiClient.post<InvoiceRecord>(`/billing/invoices/${invoiceId}/pay`, payload);
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
  }) {
    return clinicApiClient.post<ClinicalProcedureRecord>(`/procedures/${id}/complete`, payload);
  },

  // Lab Orders & Diagnostic Requisitions
  async getLabOrders(patientId?: string, status?: LabOrderStatus, date?: string) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (status) params.append('status', status);
    if (date) params.append('date', date);
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
    items?: Array<{ testName: string; category: string; instructions?: string }>;
  }) {
    return clinicApiClient.post<ClinicLabOrderRecord>('/lab-orders', payload);
  },

  async getLabOrderSlip(orderId: string) {
    return clinicApiClient.get<LabOrderSlipData>(`/lab-orders/${orderId}/slip`);
  },

  async attachExternalLabResult(orderId: string, payload: {
    externalLabName?: string;
    documentType: 'Photo' | 'PDF';
    documentUrl?: string;
    fileBase64?: string;
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

  getLabOrderSlipPdfUrl(orderId: string) {
    return clinicApiUrl(`/lab-orders/${orderId}/slip-pdf`);
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

  // Advanced Reports & Executive Analytics
  async getClinicAnalytics(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<ClinicAnalytics>(`/reports/analytics${qs ? `?${qs}` : ''}`);
  },

  async getMorbidityReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<MorbidityReport>(`/reports/morbidity${qs ? `?${qs}` : ''}`);
  },

  async getTaxDiscountAuditReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<TaxDiscountAuditReport>(`/reports/tax-discounts${qs ? `?${qs}` : ''}`);
  },

  async getDoctorSharesReport(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const qs = params.toString();
    return clinicApiClient.get<DoctorSharesReport>(`/reports/doctor-shares${qs ? `?${qs}` : ''}`);
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
  async getNcdRiskAssessments(patientId: string) {
    return clinicApiClient.get<NcdRiskAssessment[]>(`/patients/${patientId}/ncd-risk-assessment`);
  },

  async saveNcdRiskAssessment(patientId: string, payload: SaveNcdRiskAssessmentPayload) {
    return clinicApiClient.post<NcdRiskAssessment>(`/patients/${patientId}/ncd-risk-assessment`, payload);
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
    return this.activateStaff(id);
  },

  /** Sets or auto-generates a temporary password; the staff member must change it at next sign-in. Requires `staff:manage`. */
  async resetStaffPassword(id: string, temporaryPassword?: string) {
    return clinicApiClient.post<ResetStaffPasswordResult>(`/staff/${id}/reset-password`, {
      temporaryPassword: temporaryPassword || undefined,
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
    filterMode?: string
  ) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (typeof hasAlerts === 'boolean') params.append('hasAlerts', String(hasAlerts));
    if (filterMode) params.append('filterMode', filterMode);
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    const qs = params.toString();
    return clinicApiClient.get<ClinicPatient[]>(`/patients?${qs}`);
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
  }) {
    return clinicApiClient.post<AppointmentItem>('/appointments', payload);
  },

  async rescheduleAppointment(id: string, payload: {
    newScheduledAt: string;
    durationMinutes?: number;
    reason?: string;
  }) {
    return clinicApiClient.put<AppointmentItem>(`/appointments/${id}/reschedule`, payload);
  },

  async cancelAppointment(id: string, reason?: string) {
    return clinicApiClient.put<AppointmentItem>(`/appointments/${id}/cancel`, { reason });
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

  async getMedicalCertificates(patientId?: string, doctorId?: string) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (doctorId) params.append('doctorId', doctorId);
    const qs = params.toString();
    return clinicApiClient.get<MedicalCertificateRecord[]>(`/documents/medical-certificates${qs ? `?${qs}` : ''}`);
  },

  getMedicalCertificatePdfUrl(id: string) {
    return clinicApiUrl(`/documents/medical-certificates/${id}/pdf`);
  },

  async issueReferralLetter(payload: {
    patientId: string;
    patientName: string;
    consultationId?: string;
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

  async getReferralLetters(patientId?: string, doctorId?: string) {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (doctorId) params.append('doctorId', doctorId);
    const qs = params.toString();
    return clinicApiClient.get<ReferralLetterRecord[]>(`/documents/referrals${qs ? `?${qs}` : ''}`);
  },

  getReferralLetterPdfUrl(id: string) {
    return clinicApiUrl(`/documents/referrals/${id}/pdf`);
  },

  async verifyDocument(securityDigestOrNumber: string) {
    return clinicApiClient.get<DocumentVerificationResult>(`/documents/verify/${encodeURIComponent(securityDigestOrNumber)}`);
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

  async verifyRecordAttachment(attachmentId: string, isApproved: boolean, rejectionReason?: string) {
    return clinicApiClient.post<ClinicRecordAttachmentRecord>(`/records/attachments/${attachmentId}/verify`, {
      isApproved,
      rejectionReason
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
    return clinicApiClient.put<ClinicSettingsRecord>('/settings', payload);
  },

  async getWorkspaceProfile() {
    return clinicApiClient.get<WorkspaceProfile>('/settings/workspace-profile');
  },

  getReceptionPlacardPdfUrl(params?: { qrUrl?: string; joinCode?: string; expiresAt?: string }) {
    const qp = new URLSearchParams();
    if (params?.qrUrl) qp.append('qrUrl', params.qrUrl);
    if (params?.joinCode) qp.append('joinCode', params.joinCode);
    if (params?.expiresAt) qp.append('expiresAt', params.expiresAt);
    const qs = qp.toString();
    return clinicApiUrl(`/settings/reception-placard-pdf${qs ? `?${qs}` : ''}`);
  },

  async getPublicQueueDisplay(clinicId?: string, facilitySlug?: string, tenantSlug?: string) {
    const params = new URLSearchParams();
    if (clinicId) params.append('clinicId', clinicId);
    if (facilitySlug) params.append('facilitySlug', facilitySlug);
    if (tenantSlug) params.append('tenantSlug', tenantSlug);
    const query = params.toString();
    return clinicApiClient.get<any>(`/public/queue/display${query ? `?${query}` : ''}`);
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
};

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



