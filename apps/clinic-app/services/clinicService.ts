import { clinicApiClient } from './apiClient';
import { SyncStatus } from '@shared/safe';

export interface PatientQueueItem {
  id: string;
  patientId: string;
  patientName: string;
  queueNumber: number;
  priority: 'routine' | 'urgent' | 'emergency';
  status: 'waiting' | 'in_consultation' | 'completed';
  checkInTime: string;
}

export interface ConsultationRecord {
  id: string;
  patientId: string;
  doctorId: string;
  chiefComplaint: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  prescriptions: string[];
  syncStatus: SyncStatus;
  createdAt: string;
}

export interface AppointmentItem {
  id: string;
  patientName: string;
  scheduledTime: string;
  doctorName: string;
  type: string;
  status: 'confirmed' | 'checked_in' | 'cancelled';
}

export const clinicService = {
  async getQueue() {
    return clinicApiClient.get<PatientQueueItem[]>('/queue');
  },

  async getConsultations(patientId?: string) {
    const url = patientId ? `/consultations?patientId=${patientId}` : '/consultations';
    return clinicApiClient.get<ConsultationRecord[]>(url);
  },

  async createConsultation(payload: Partial<ConsultationRecord>) {
    return clinicApiClient.post<ConsultationRecord>('/consultations', payload);
  },

  async getAppointments() {
    return clinicApiClient.get<AppointmentItem[]>('/appointments');
  },
};
