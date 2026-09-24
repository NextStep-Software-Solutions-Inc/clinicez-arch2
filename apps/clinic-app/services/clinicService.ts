import { clinicApiClient } from './apiClient';
import { SyncStatus } from '@shared/safe';

export type QueuePriority = 'Routine' | 'Urgent' | 'Emergency';
export type QueueStatus = 'Waiting' | 'Triaged' | 'InConsultation' | 'Completed' | 'Cancelled' | 'NoShow';
export type AppointmentStatus = 'Pending' | 'Confirmed' | 'CheckedIn' | 'InConsultation' | 'Completed' | 'Cancelled';
export type StaffRole = 'Doctor' | 'Nurse' | 'Receptionist' | 'Admin';

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
