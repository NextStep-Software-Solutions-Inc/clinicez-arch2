import { labApiClient } from './apiClient';

export interface SpecimenItem {
  id: string;
  barcode: string;
  containerType: string;
  specimenType: string;
  status: 'Pending' | 'Collected' | 'ReceivedInLab' | 'Rejected';
  collectedAt?: string;
  collectedByPhlebotomistName?: string;
  receivedInLabAt?: string;
  notes?: string;
}

export interface AnalyteResultItem {
  id: string;
  panelName: string;
  analyteCode: string;
  analyteName: string;
  value: string;
  unit: string;
  referenceInterval: string;
  flag: 'Normal' | 'Low' | 'High' | 'Critical';
  interpretation?: string;
  enteredByMedTechName?: string;
  enteredAt?: string;
}

export interface DiagnosticReportItem {
  id: string;
  reportNumber: string;
  releasedAt: string;
  pathologistName: string;
  pathologistPrcLicense: string;
  medicalTechnologistName: string;
  medicalTechnologistPrcLicense: string;
  pathologistImpression?: string;
  isCriticalResult: boolean;
  signedPdfBase64?: string;
}

export interface LabRequisitionItem {
  id: string;
  externalRequisitionId?: string;
  accessionNumber: string;
  orderingFacilityName: string;
  orderingDoctorName: string;
  orderingDoctorPrc?: string;
  patientId: string;
  patientName: string;
  philHealthPin?: string;
  patientAge: number;
  patientGender: string;
  contactNumber?: string;
  clinicalDiagnosis?: string;
  fastingInstructions?: string;
  urgency: 'Routine' | 'STAT';
  status: 'PendingAccession' | 'SpecimenCollected' | 'InTesting' | 'AwaitingReview' | 'Verified' | 'Rejected';
  createdAt: string;
  specimens: SpecimenItem[];
  analyteResults: AnalyteResultItem[];
  diagnosticReport?: DiagnosticReportItem;
}

export interface AnalyteCatalogSpec {
  panelName: string;
  analyteCode: string;
  analyteName: string;
  unit: string;
  referenceInterval: string;
}

export const laboratoryService = {
  async getWorklist(status?: string, searchTerm?: string) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (searchTerm) params.append('searchTerm', searchTerm);
    const qs = params.toString();
    return labApiClient.get<LabRequisitionItem[]>(`/requisitions${qs ? `?${qs}` : ''}`);
  },

  async getRequisition(id: string) {
    return labApiClient.get<LabRequisitionItem>(`/requisitions/${id}`);
  },

  async getByAccession(accessionNumber: string) {
    return labApiClient.get<LabRequisitionItem>(`/requisitions/by-accession/${encodeURIComponent(accessionNumber)}`);
  },

  async accessionSpecimen(id: string, phlebotomistName: string, specimens: {
    specimenId?: string;
    barcode?: string;
    containerType: string;
    specimenType: string;
    collectedAt?: string;
    notes?: string;
  }[]) {
    return labApiClient.post<LabRequisitionItem>(`/requisitions/${id}/accession`, {
      phlebotomistName,
      specimens
    });
  },

  async getCatalog() {
    return labApiClient.get<AnalyteCatalogSpec[]>('/results/catalog');
  },

  async recordResults(requisitionId: string, medTechName: string, results: {
    panelName?: string;
    analyteCode: string;
    analyteName?: string;
    value: string;
    unit?: string;
    interpretation?: string;
  }[]) {
    return labApiClient.post<LabRequisitionItem>(`/results/${requisitionId}`, {
      medTechName,
      results
    });
  },

  async verifyAndSignReport(requisitionId: string, payload: {
    pathologistName: string;
    pathologistPrcLicense: string;
    medicalTechnologistName: string;
    medicalTechnologistPrcLicense: string;
    pathologistImpression?: string;
    signedPdfBase64?: string;
  }) {
    return labApiClient.post<LabRequisitionItem>(`/reports/${requisitionId}/verify`, payload);
  },

  async getReport(requisitionId: string) {
    return labApiClient.get<DiagnosticReportItem>(`/reports/${requisitionId}`);
  }
};
