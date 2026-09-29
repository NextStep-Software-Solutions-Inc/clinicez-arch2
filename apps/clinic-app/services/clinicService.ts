import { clinicApiClient } from './apiClient';
import { SyncStatus } from '@shared/safe';

export type QueuePriority = 'Routine' | 'Urgent' | 'Emergency';
export type QueueStatus = 'Waiting' | 'Triaged' | 'InConsultation' | 'Completed' | 'Cancelled' | 'NoShow';
export type AppointmentStatus = 'Pending' | 'Confirmed' | 'CheckedIn' | 'InConsultation' | 'Completed' | 'Cancelled';
export type StaffRole = 'Doctor' | 'Nurse' | 'Receptionist' | 'Admin';
export type InvoiceStatus = 'Draft' | 'Paid' | 'PartiallyPaid' | 'Voided' | 'Refunded';
export type PaymentMethod = 'Cash' | 'GCash' | 'Maya' | 'CreditCard' | 'DebitCard' | 'PhilHealthKonsulta' | 'HmoInsurance';
export type DiscountType = 'None' | 'SeniorCitizen' | 'Pwd' | 'PhilHealthKonsulta' | 'Custom';
export type ProcedureStatus = 'Ordered' | 'InProgress' | 'Completed' | 'Cancelled';
export type LabOrderStatus = 'Ordered' | 'SpecimenCollected' | 'SentToLab' | 'ResultsReceived' | 'Completed' | 'Cancelled';

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
  status: LabOrderStatus;
  clinicalDiagnosis?: string;
  notes?: string;
  items: ClinicLabOrderItem[];
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
  }>;
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

  async createService(payload: { code: string; name: string; category: string; standardPrice: number; description?: string }) {
    return clinicApiClient.post<ClinicServiceItem>('/services', payload);
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

  // Daily Operations Census & Cashier Remittance
  async getDailyEodReport(date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return clinicApiClient.get<DailyEodReport>(`/reports/daily-eod${qs}`);
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

  async getRoles() {
    return clinicApiClient.get<ClinicRole[]>('/roles');
  }
};
