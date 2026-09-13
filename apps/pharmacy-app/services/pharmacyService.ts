import { pharmacyApiClient } from './apiClient';
import { SyncStatus } from '@shared/safe';

export interface PrescriptionOrder {
  id: string;
  prescriptionNumber: string;
  patientId: string;
  patientName: string;
  prescribingDoctor: string;
  items: PrescriptionItem[];
  status: 'pending' | 'dispensing' | 'dispensed' | 'cancelled';
  createdAt: string;
}

export interface PrescriptionItem {
  drugId: string;
  genericName: string;
  brandName?: string;
  dosage: string;
  quantity: number;
  instructions: string;
}

export interface InventoryDrug {
  id: string;
  sku: string;
  genericName: string;
  brandName?: string;
  dosageForm: string;
  strength: string;
  currentStock: number;
  reorderLevel: number;
  unitPrice: number;
  batchNumber: string;
  expiryDate: string;
  syncStatus: SyncStatus;
}

export const pharmacyService = {
  async getPrescriptions() {
    return pharmacyApiClient.get<PrescriptionOrder[]>('/prescriptions');
  },

  async getInventory() {
    return pharmacyApiClient.get<InventoryDrug[]>('/inventory');
  },

  async dispensePrescription(prescriptionId: string, payload: { batchNumbers: Record<string, string> }) {
    return pharmacyApiClient.post<PrescriptionOrder>(`/prescriptions/${prescriptionId}/dispense`, payload);
  },
};
