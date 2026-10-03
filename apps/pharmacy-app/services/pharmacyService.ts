import { pharmacyApiClient } from './apiClient';

export interface BatchAllocationRecommendationDto {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantityAvailable: number;
  suggestedAllocation: number;
}

export interface PrescriptionItemResponseDto {
  id: string;
  inventoryItemId?: string;
  genericName: string;
  brandName?: string;
  dosage: string;
  form: string;
  sig: string;
  quantityPrescribed: number;
  quantityDispensed: number;
  allocatedBatchNumber?: string;
  allocatedBatchExpiry?: string;
  unitPrice: number;
  subtotal: number;
  status: string;
  isDangerousDrug: boolean;
  remarks?: string;
  availableBatches: BatchAllocationRecommendationDto[];
}

export interface DispenseAuditRecordDto {
  id: string;
  pharmacistName: string;
  pharmacistPrcLicense: string;
  dispensedAt: string;
  totalAmount: number;
  receiptNumber?: string;
  batchDeductionsJson: string;
  notes?: string;
}

export interface PrescriptionOrderDto {
  id: string;
  tenantId: string;
  pharmacyId: string;
  externalPrescriptionId: string;
  prescriptionNumber: string;
  orderingFacilityId: string;
  orderingFacilityName: string;
  orderingDoctorName: string;
  doctorPrcLicense: string;
  doctorPtr?: string;
  doctorS2License?: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientContact?: string;
  patientAllergies?: string;
  clinicalDiagnosis?: string;
  specialInstructions?: string;
  status: 'Pending' | 'InPreparation' | 'ReadyForPickup' | 'Dispensed' | 'Cancelled' | string;
  issuedAt: string;
  dispensedAt?: string;
  dispensingPharmacistName?: string;
  dispensingPharmacistPrc?: string;
  totalAmount: number;
  items: PrescriptionItemResponseDto[];
  dispenseRecords: DispenseAuditRecordDto[];
}

export interface InventoryBatchDto {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  receivedDate: string;
  status: string;
}

export interface PharmacyInventoryItemDto {
  id: string;
  sku: string;
  genericName: string;
  brandName?: string;
  dosageForm: string;
  strength: string;
  currentStock: number;
  reorderLevel: number;
  unitCost: number;
  unitPrice: number;
  storageCondition?: string;
  isDangerousDrug: boolean;
  isLowStock: boolean;
  batches: InventoryBatchDto[];
}

export interface DispensePayload {
  pharmacistName: string;
  pharmacistPrcLicense: string;
  receiptNumber?: string;
  notes?: string;
}

export const pharmacyService = {
  async getPrescriptions(status?: string, search?: string) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const qs = params.toString();
    return pharmacyApiClient.get<PrescriptionOrderDto[]>(`/prescriptions${qs ? `?${qs}` : ''}`);
  },

  async getPrescriptionDetails(id: string) {
    return pharmacyApiClient.get<PrescriptionOrderDto>(`/prescriptions/${id}`);
  },

  async dispensePrescription(prescriptionId: string, payload: DispensePayload) {
    return pharmacyApiClient.post<PrescriptionOrderDto>(`/prescriptions/${prescriptionId}/dispense`, payload);
  },

  async getInventory(search?: string, lowStockOnly?: boolean) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (lowStockOnly) params.append('lowStockOnly', 'true');
    const qs = params.toString();
    return pharmacyApiClient.get<PharmacyInventoryItemDto[]>(`/inventory${qs ? `?${qs}` : ''}`);
  },

  async addBatch(payload: { inventoryItemId: string; batchNumber: string; expiryDate: string; quantityReceived: number }) {
    return pharmacyApiClient.post<PharmacyInventoryItemDto>('/inventory/batches', payload);
  },

  async seedInventory() {
    return pharmacyApiClient.post<number>('/inventory/seed');
  }
};
