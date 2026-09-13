import { labApiClient } from './apiClient';
import { SyncStatus } from '@shared/safe';

export interface LabOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  testCodes: string[];
  priority: 'routine' | 'stat';
  status: 'ordered' | 'sample_collected' | 'processing' | 'completed';
  orderingDoctor: string;
  createdAt: string;
}

export interface SpecimenSample {
  id: string;
  barcode: string;
  orderId: string;
  type: 'whole_blood' | 'serum' | 'urine' | 'swab';
  containerType: 'edta_lavender' | 'sst_gold' | 'plain_red' | 'sterile_cup';
  collectedAt: string;
  collectedBy: string;
}

export interface LabResultEntry {
  id: string;
  orderId: string;
  testCode: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  isAbnormal: boolean;
  verifiedBy?: string;
  syncStatus: SyncStatus;
}

export const laboratoryService = {
  async getWorklist() {
    return labApiClient.get<LabOrder[]>('/orders');
  },

  async getSpecimens() {
    return labApiClient.get<SpecimenSample[]>('/specimens');
  },

  async submitResults(orderId: string, results: Partial<LabResultEntry>[]) {
    return labApiClient.post<LabResultEntry[]>(`/orders/${orderId}/results`, results);
  },
};
