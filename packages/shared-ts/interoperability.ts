export interface RequisitionItem {
  itemCode: string;
  itemName: string;
  category: string;
  urgency: 'Routine' | 'STAT';
  specimenRequirement?: string;
}

export interface OrderingDoctor {
  doctorId: string;
  doctorName: string;
  prcLicenseNumber: string;
  ptrNumber?: string;
  specialization?: string;
}

export interface RequisitionPatient {
  patientId: string;
  philHealthPin?: string;
  nationalId?: string;
  fullName: string;
  dateOfBirth?: string;
  age: number;
  gender: string;
  contactNumber?: string;
}

export interface LabRequisitionContract {
  requisitionId: string;
  accessionNumber: string;
  orderingFacilityId: string;
  orderingFacilityName: string;
  tenantId: string;
  targetFacilityId?: string;
  targetTenantId?: string;
  orderingDoctor: OrderingDoctor;
  patient: RequisitionPatient;
  icd10Code?: string;
  provisionalDiagnosis?: string;
  fastingInstructions?: string;
  urgency: 'Routine' | 'STAT';
  items: RequisitionItem[];
  publicUploadToken: string;
  publicUploadUrl: string;
  issuedAt: string;
}

export interface AnalyteObservation {
  panelName: string;
  analyteCode: string;
  analyteName: string;
  value: string;
  unit: string;
  referenceInterval: string;
  flag: 'Normal' | 'Low' | 'High' | 'Critical';
  interpretation?: string;
}

export interface DiagnosticReportContract {
  reportId: string;
  requisitionId: string;
  accessionNumber: string;
  laboratoryFacilityId: string;
  laboratoryTenantId: string;
  laboratoryName: string;
  pathologistName: string;
  pathologistPrcLicense: string;
  medicalTechnologistName: string;
  medicalTechnologistPrcLicense: string;
  releasedAt: string;
  observations: AnalyteObservation[];
  pathologistImpression?: string;
  isCriticalResult: boolean;
  signedPdfBase64?: string;
}

export interface ExternalLabResultUpload {
  uploadId: string;
  requisitionId: string;
  accessionNumber: string;
  patientId: string;
  uploadedBy: 'Patient' | 'ExternalLab' | 'ClinicStaff';
  externalLabName?: string;
  documentType: 'Photo' | 'PDF';
  documentUrl?: string;
  fileBase64?: string;
  notes?: string;
  uploadedAt: string;
}

export interface PrescriptionItemContract {
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
}

export interface PrescriberDoctorContract {
  doctorId: string;
  doctorName: string;
  prcLicenseNumber: string;
  ptrNumber?: string;
  s2LicenseNumber?: string;
  specialization?: string;
}

export interface PrescriptionPatientContract {
  patientId: string;
  philHealthPin?: string;
  nationalId?: string;
  fullName: string;
  dateOfBirth?: string;
  age: number;
  gender: string;
  contactNumber?: string;
  allergies?: string;
}

export interface PrescriptionIssuedContract {
  prescriptionId: string;
  prescriptionNumber: string;
  orderingFacilityId: string;
  orderingFacilityName: string;
  tenantId: string;
  targetPharmacyFacilityId?: string;
  targetPharmacyTenantId?: string;
  prescriberDoctor: PrescriberDoctorContract;
  patient: PrescriptionPatientContract;
  clinicalDiagnosis?: string;
  specialInstructions?: string;
  items: PrescriptionItemContract[];
  publicVerificationToken: string;
  publicVerificationUrl: string;
  qrPayload: string;
  issuedAt: string;
}

export interface DispensedMedicationContract {
  itemId: string;
  genericName: string;
  brandName?: string;
  dosage: string;
  form: string;
  quantityDispensed: number;
  batchNumber: string;
  expiryDate: string;
  unitPrice: number;
  subtotal: number;
}

export interface PrescriptionDispensedContract {
  dispenseId: string;
  prescriptionId: string;
  prescriptionNumber: string;
  pharmacyFacilityId: string;
  pharmacyFacilityName: string;
  pharmacyTenantId: string;
  dispensingPharmacistName: string;
  dispensingPharmacistPrcLicense: string;
  dispensedAt: string;
  dispensedItems: DispensedMedicationContract[];
  totalAmount: number;
  receiptNumber?: string;
  notes?: string;
}

export interface ExternalPrescriptionDispensedContract {
  eventId: string;
  prescriptionId: string;
  prescriptionNumber: string;
  externalPharmacyName: string;
  externalBranchLocation?: string;
  pharmacistName?: string;
  pharmacistPrcLicense?: string;
  officialReceiptNumber?: string;
  receiptDocumentUrl?: string;
  receiptDocumentBase64?: string;
  notes?: string;
  dispensedAt: string;
}

export interface PrescriptionSlipContract {
  prescriptionId: string;
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
  patientPhilHealth?: string;
  patientAllergies?: string;
  clinicalDiagnosis?: string;
  specialInstructions?: string;
  items: PrescriptionItemContract[];
  publicVerificationToken: string;
  publicVerificationUrl: string;
  qrPayload: string;
  dispenseStatus: 'Issued' | 'DispensedPartner' | 'DispensedExternally' | 'Cancelled';
  externalDispenseDetails?: ExternalPrescriptionDispensedContract;
}

