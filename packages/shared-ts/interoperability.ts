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
