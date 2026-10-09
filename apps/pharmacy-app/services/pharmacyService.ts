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

export type PrescriptionOrderStatus =
  | 'Pending'
  | 'Accepted'
  | 'PartiallyAccepted'
  | 'Rejected'
  | 'InPreparation'
  | 'ReadyForPickup'
  | 'Dispensed'
  | 'Cancelled';

export type PaymentPolicy = 'Prepaid' | 'Postpaid' | 'None';

export type PaymentStatus = 'NotRequired' | 'AwaitingPayment' | 'Paid';

export type DispenseBlockedReason = 'acceptance_required' | 'payment_required';

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
  status: PrescriptionOrderStatus;
  issuedAt: string;
  dispensedAt?: string;
  dispensingPharmacistName?: string;
  dispensingPharmacistPrc?: string;
  totalAmount: number;
  paymentPolicy: PaymentPolicy;
  paymentStatus: PaymentStatus;
  quotedAmount: number | null;
  paidAt: string | null;
  statusReason: string | null;
  pharmacyName: string;
  dispenseBlockedReason: DispenseBlockedReason | null;
  patientLinked: boolean;
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

export interface PartialAcceptPayload {
  acceptedItemIds: string[];
  reason: string;
}

export interface RejectPayload {
  reason: string;
}

export interface PrescriptionClaimResultDto {
  claimId: string;
  prescriptionId: string;
  issuerTenantId: string;
  issuerFacilityId: string;
  type: string;
}

export interface PharmacySettingsDto {
  pharmacyName: string;
  paymentPolicy: PaymentPolicy;
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

  async acceptPrescription(prescriptionId: string) {
    return pharmacyApiClient.post<PrescriptionOrderDto>(`/prescriptions/${prescriptionId}/accept`, {});
  },

  async partiallyAcceptPrescription(prescriptionId: string, payload: PartialAcceptPayload) {
    return pharmacyApiClient.post<PrescriptionOrderDto>(`/prescriptions/${prescriptionId}/partial-accept`, payload);
  },

  async rejectPrescription(prescriptionId: string, payload: RejectPayload) {
    return pharmacyApiClient.post<PrescriptionOrderDto>(`/prescriptions/${prescriptionId}/reject`, payload);
  },

  async claimPrescription(token: string) {
    return pharmacyApiClient.post<PrescriptionClaimResultDto>('/prescriptions/claim', { token });
  },

  async getPrescriptionByPrescriptionId(prescriptionId: string) {
    return pharmacyApiClient.get<PrescriptionOrderDto>(
      `/prescriptions/by-prescription/${encodeURIComponent(prescriptionId)}`
    );
  },

  async getSettings() {
    return pharmacyApiClient.get<PharmacySettingsDto>('/settings');
  },

  async updatePaymentPolicy(paymentPolicy: PaymentPolicy) {
    return pharmacyApiClient.put<PharmacySettingsDto>('/settings/payment-policy', { paymentPolicy });
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
  },

  // Scope 5: Facility Licensing & Autonomous Staff Roster
  async getLicenseStatus() {
    return pharmacyApiClient.get<PharmacyLicenseStatus>('/license');
  },

  async applyLicense(licenseToken: string) {
    return pharmacyApiClient.post<PharmacyLicenseStatus>('/license/apply', { licenseToken });
  },

  async getStaff(role?: PharmacyStaffRole, isActive?: boolean) {
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (typeof isActive === 'boolean') params.append('isActive', String(isActive));
    const qs = params.toString();
    return pharmacyApiClient.get<PharmacyStaffMember[]>(`/staff${qs ? `?${qs}` : ''}`);
  },

  async createStaff(payload: CreatePharmacyStaffPayload) {
    return pharmacyApiClient.post<PharmacyStaffMember>('/staff', payload);
  },

  async updateStaff(id: string, payload: Partial<CreatePharmacyStaffPayload>) {
    return pharmacyApiClient.put<PharmacyStaffMember>(`/staff/${id}`, payload);
  },

  async deactivateStaff(id: string) {
    return pharmacyApiClient.delete(`/staff/${id}`);
  }
};

export type PharmacyStaffRole =
  | 'ChiefPharmacist'
  | 'StaffPharmacist'
  | 'PharmacyTechnician'
  | 'Cashier'
  | 'InventoryClerk';

export interface PharmacyStaffMember {
  id: string;
  tenantId: string;
  pharmacyId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  role: PharmacyStaffRole;
  email?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  s2LicenseNumber?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreatePharmacyStaffPayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  role: PharmacyStaffRole;
  email?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  s2LicenseNumber?: string;
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

export interface PharmacyLicenseStatus {
  status: 'Active' | 'ActivationRequired' | 'Expired' | 'Tampered';
  pharmacyId: string;
  pharmacyName: string;
  planTier: string;
  limits: FacilityLimits;
  activeStaffCount: number;
  enabledFeatures: string[];
  expiresAtUtc?: string;
  isTampered: boolean;
  errorMessage?: string;
}
