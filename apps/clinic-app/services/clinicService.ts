import { clinicApiClient, pharmacyApiClient, CLINIC_BASE_URL, API_PREFIX } from './apiClient';
import { SyncStatus, joinApiUrl } from '@shared/safe';

export type QueuePriority = 'Routine' | 'Urgent' | 'Emergency';
export type QueueStatus = 'Waiting' | 'Triaged' | 'InConsultation' | 'Completed' | 'Cancelled' | 'NoShow';
export type AppointmentStatus = 'Pending' | 'Confirmed' | 'CheckedIn' | 'InConsultation' | 'Completed' | 'Cancelled';
export type StaffRole = 'Doctor' | 'Nurse' | 'Receptionist' | 'Cashier' | 'Admin';
export type InvoiceStatus = 'Draft' | 'Paid' | 'PartiallyPaid' | 'Voided' | 'Refunded';
export type PaymentMethod = 'Cash' | 'GCash' | 'Maya' | 'CreditCard' | 'DebitCard' | 'PhilHealthKonsulta' | 'HmoInsurance';
export type DiscountType = 'None' | 'SeniorCitizen' | 'Pwd' | 'PhilHealthKonsulta' | 'Custom';
export type ProcedureStatus = 'Ordered' | 'InProgress' | 'Completed' | 'Cancelled';
export type LabOrderStatus = 'Draft' | 'Ordered' | 'SpecimenCollected' | 'InTesting' | 'SentToLab' | 'ResultsReceived' | 'Completed' | 'CompletedWithExternalReport' | 'Cancelled';

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
  specialty?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateStaffPayload {
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
  specialty?: string;
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
}

export interface QueueMetrics {
  inQueue: number;
  urgentTriage: number;
  completedToday: number;
  totalCheckedIn: number;
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
  isSigned: boolean;
  signedAt?: string;
  diagnoses: EncounterDiagnosis[];
  prescriptions: PrescriptionItem[];
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

export interface Icd10Code {
  code: string;
  description: string;
  category: string;
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
}

export interface ClinicLabOrderItem {
  id: string;
  testName: string;
  category: string;
  instructions?: string;
  status: LabOrderStatus;
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
  clinicalDiagnosis?: string;
  notes?: string;
  items: ClinicLabOrderItem[];
  testName?: string;
  specimenType?: string;
  publicUploadToken?: string;
  publicUploadUrl?: string;
  externalLabName?: string;
  externalReportUrl?: string;
  externalReportFileBase64?: string;
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

export interface PatientChart {
  patientId: string;
  patientName: string;
  totalVisits: number;
  consultations: ConsultationRecord[];
  vitalsHistory: TriageVitals[];
  proceduresHistory: ClinicalProcedureRecord[];
  labOrdersHistory: ClinicLabOrderRecord[];
  invoicesHistory: InvoiceRecord[];
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
  alerts?: string;
  syncPatientId?: string;
  customFields?: Record<string, any>;
  verificationStatus?: string;
  createdAt: string;
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
  createdAt: string;
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
}

export interface CheckInRequest {
  patientId: string;
  patientName: string;
  appointmentId?: string;
  doctorId?: string;
  doctorName?: string;
  priority?: QueuePriority;
  chiefComplaint?: string;
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

export const clinicService = {
  // Queue & Walk-In Engine
  async getQueue(date?: string, status?: QueueStatus) {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (status) params.append('status', status);
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

  async callQueueItem(id: string, doctorId?: string, doctorName?: string) {
    return clinicApiClient.post<PatientQueueItem>(`/queue/${id}/call`, { doctorId, doctorName });
  },

  async completeQueueItem(id: string) {
    return clinicApiClient.post<boolean>(`/queue/${id}/complete`);
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

  async signConsultation(id: string, credentials?: { prcLicenseNumber?: string; ptrNumber?: string; s2LicenseNumber?: string }) {
    return clinicApiClient.post<ConsultationRecord>(`/consultations/${id}/sign`, credentials ?? {});
  },

  // E-Prescriptions & Dual-Path Dispense
  async getPrescriptionSlip(consultationId: string) {
    return clinicApiClient.get<PrescriptionSlipData>(`/prescriptions/${consultationId}/slip`);
  },

  async recordExternalDispense(consultationId: string, payload: RecordExternalDispensePayload) {
    return clinicApiClient.post<PrescriptionSlipData>(`/prescriptions/${consultationId}/record-external-dispense`, payload);
  },

  getPrescriptionSlipPdfUrl(consultationId: string) {
    return joinApiUrl(CLINIC_BASE_URL, `/prescriptions/${consultationId}/slip-pdf`);
  },

  getPrescriptionSlipPdfByNumberUrl(prescriptionNumber: string) {
    return joinApiUrl(CLINIC_BASE_URL, `/prescriptions/by-number/${encodeURIComponent(prescriptionNumber)}/slip-pdf`);
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
    return joinApiUrl(CLINIC_BASE_URL, `/lab-orders/${orderId}/report-pdf`);
  },

  getLabOrderSlipPdfUrl(orderId: string) {
    return joinApiUrl(CLINIC_BASE_URL, `/lab-orders/${orderId}/slip-pdf`);
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

  async deactivateStaff(id: string) {
    return clinicApiClient.delete(`/staff/${id}`);
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

  // Patients Directory & Master Patient Index
  async getPatients(search?: string, hasAlerts?: boolean, page: number = 1, pageSize: number = 50) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (typeof hasAlerts === 'boolean') params.append('hasAlerts', String(hasAlerts));
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    const qs = params.toString();
    return clinicApiClient.get<ClinicPatient[]>(`/patients?${qs}`);
  },

  async getPatientById(id: string) {
    return clinicApiClient.get<ClinicPatient>(`/patients/${id}`);
  },

  async registerPatient(payload: RegisterPatientPayload) {
    return clinicApiClient.post<ClinicPatient>('/patients', payload);
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
    return joinApiUrl(CLINIC_BASE_URL, `/documents/medical-certificates/${id}/pdf`);
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
    return joinApiUrl(CLINIC_BASE_URL, `/documents/referrals/${id}/pdf`);
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
  }) {
    return clinicApiClient.post<ClinicRecordAttachmentRecord>('/records/attachments', payload);
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
    return joinApiUrl(CLINIC_BASE_URL, `/records/attachments/${attachmentId}/download`);
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

  async deleteCustomField(id: string) {
    return clinicApiClient.delete<boolean>(`/custom-fields/${id}`);
  },

  // Clinic Preferences / Settings
  async getSettings() {
    return clinicApiClient.get<ClinicSettingsRecord>('/settings');
  },

  async updateSettings(payload: Partial<ClinicSettingsRecord>) {
    return clinicApiClient.put<ClinicSettingsRecord>('/settings', payload);
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

  async getPhilHealthCatalog(catalogType: string) {
    return clinicApiClient.get<PhilHealthCatalogItem[]>(`/yakap/catalogs/${encodeURIComponent(catalogType)}`);
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


  // PhilHealth GAMOT & UPSC
  async getGamotLedger(pin: string, year?: string) {
    const qs = year ? `?year=${encodeURIComponent(year)}` : '';
    return pharmacyApiClient.get<GamotBeneficiaryLedger>(`/gamot/ledger/${encodeURIComponent(pin)}${qs}`);
  },

  async getGamotFormulary(search?: string, category?: string) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    const qs = params.toString();
    return pharmacyApiClient.get<GamotFormularyItem[]>(`/gamot/formulary${qs ? `?${qs}` : ''}`);
  },

  async generateUpsc(payload: GenerateUpscPayload) {
    return pharmacyApiClient.post<UpscGenerateResult>('/gamot/upsc/generate', payload);
  },

  async validateUpsc(payload: ValidateUpscPayload) {
    return pharmacyApiClient.post<UpscVerifyResult>('/gamot/upsc/validate', payload);
  },

  async dispenseGamot(payload: DispenseGamotPayload) {
    return pharmacyApiClient.post<any>('/gamot/dispense', payload);
  },

  async reverseGamotTransaction(id: string, payload: ReverseGamotPayload) {
    return pharmacyApiClient.post<GamotLedgerTransaction>(`/gamot/transactions/${id}/reverse`, payload);
  }
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
  publicUploadToken: string;
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

export interface PhilHealthCatalogItem {
  code: string;
  description: string;
  category?: string;
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

  isSmoker: boolean;
  cigarettesPerDay?: string;
  isAlcoholDrinker: boolean;
  bottlesPerDay?: string;
  illDrugUser: boolean;
  isSexuallyActive: boolean;

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


