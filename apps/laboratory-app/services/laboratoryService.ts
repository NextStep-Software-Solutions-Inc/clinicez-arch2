import { labApiClient } from './apiClient';
import { joinApiUrl } from '@shared/safe';

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

  // Rejection metadata
  rejectionReason?: string;
  rejectionNotes?: string;
  rejectedAt?: string;
  rejectedByPhlebotomistName?: string;
  correctiveAction?: string;

  // Storage rack metadata
  rackId?: string;
  rackPosition?: string;
  storageTemperature?: string;
  storageStatus?: string;
  storedAt?: string;
  disposedAt?: string;
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
  deltaCheckAlert?: string;
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

export interface PrintableTubeStickerItem {
  barcode: string;
  accessionNumber: string;
  patientName: string;
  patientGender: string;
  patientAge: number;
  philHealthPin?: string;
  containerType: string;
  containerColor: string;
  hexColor: string;
  specimenType: string;
  requiredTests: string;
  urgency: string;
  drawnAt?: string;
  phlebotomistName?: string;
  rackLocation?: string;
}

export interface RackInventoryItem {
  specimenId: string;
  requisitionId: string;
  barcode: string;
  accessionNumber: string;
  patientName: string;
  containerType: string;
  specimenType: string;
  rackId: string;
  rackPosition: string;
  storageTemperature: string;
  storageStatus: string;
  storedAt?: string;
}

export interface QcLotItem {
  id: string;
  tenantId: string;
  lotNumber: string;
  controlName: string;
  level: string;
  analyteCode: string;
  instrumentName: string;
  targetMean: number;
  targetStandardDeviation: number;
  manufacturerExpirationDate: string;
  openVialDate?: string;
  openVialStabilityDays: number;
  openVialExpirationDate?: string;
  isExpired: boolean;
  daysRemaining?: number;
  isActive: boolean;
}

export interface QcRunItem {
  id: string;
  qcLotId: string;
  analyteCode: string;
  measuredValue: number;
  zScore: number;
  runAt: string;
  runByMedTechName: string;
  status: 'Passed' | 'Warning' | 'Rejected';
  violationRules: string;
  correctiveAction?: string;
  notes?: string;
}

export interface LeveyJenningsPoint {
  runId: string;
  runAt: string;
  measuredValue: number;
  zScore: number;
  status: string;
  violationRules?: string;
}

export interface LeveyJenningsChartData {
  lotId: string;
  lotNumber: string;
  controlName: string;
  level: string;
  analyteCode: string;
  targetMean: number;
  targetSD: number;
  plus1SD: number;
  plus2SD: number;
  plus3SD: number;
  minus1SD: number;
  minus2SD: number;
  minus3SD: number;
  points: LeveyJenningsPoint[];
}

export interface CriticalPanicDispatchLogItem {
  id: string;
  requisitionId: string;
  accessionNumber: string;
  patientName: string;
  orderingDoctorName: string;
  orderingFacilityName: string;
  criticalFindings: string;
  dispatchedAt: string;
  dispatchedByMedTechName: string;
  notifiedDoctorName: string;
  notificationMethod: string;
  readbackConfirmed: boolean;
  readbackNotes?: string;
  acknowledgedAt?: string;
}

export interface IngestFeedResult {
  protocol: string;
  analyzerId: string;
  accessionNumber: string;
  ingestedCount: number;
  hasDeltaCheckAlerts: boolean;
  hasCriticalFlags: boolean;
  requisition?: LabRequisitionItem;
}

export interface SimulateAnalyzerResult {
  format: string;
  analyzerModel: string;
  accessionNumber: string;
  rawPayload: string;
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

  // Scope 1: Phlebotomy, Stickers, Rejection, Storage Racks
  async getTubeStickers(requisitionId: string) {
    return labApiClient.get<PrintableTubeStickerItem[]>(`/requisitions/${requisitionId}/stickers`);
  },

  async rejectSpecimen(requisitionId: string, specimenId: string, payload: {
    reasonCode: string;
    notes?: string;
    phlebotomistName?: string;
    correctiveAction?: string;
  }) {
    return labApiClient.post<LabRequisitionItem>(`/requisitions/${requisitionId}/specimens/${specimenId}/reject`, payload);
  },

  async storeSpecimen(requisitionId: string, specimenId: string, payload: {
    rackId: string;
    rackPosition: string;
    temperature?: string;
  }) {
    return labApiClient.post<LabRequisitionItem>(`/requisitions/${requisitionId}/specimens/${specimenId}/store`, payload);
  },

  async getRackInventory(rackId?: string) {
    const qs = rackId ? `?rackId=${encodeURIComponent(rackId)}` : '';
    return labApiClient.get<RackInventoryItem[]>(`/requisitions/racks${qs}`);
  },

  // Scope 2: Analyte Catalog, Results, Analyzer Feeds & Simulation
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

  async ingestAnalyzerFeed(rawPayload: string, protocolHint?: string, medTechName?: string) {
    return labApiClient.post<IngestFeedResult>('/analyzers/feed', {
      rawPayload,
      protocolHint,
      medTechName
    });
  },

  async simulateAnalyzer(accessionNumber: string, analyzerModel = 'Mindray BC-5150', format = 'ASTM') {
    return labApiClient.post<SimulateAnalyzerResult>('/analyzers/simulate', {
      accessionNumber,
      analyzerModel,
      format
    });
  },

  // Scope 3: Quality Control & Westgard Multi-Rules
  async getQcLots(analyteCode?: string, activeOnly = true) {
    const params = new URLSearchParams();
    if (analyteCode) params.append('analyteCode', analyteCode);
    params.append('activeOnly', String(activeOnly));
    return labApiClient.get<QcLotItem[]>(`/qc/lots?${params.toString()}`);
  },

  async createQcLot(payload: {
    tenantId?: string;
    lotNumber: string;
    controlName: string;
    level: string;
    analyteCode: string;
    instrumentName: string;
    targetMean: number;
    targetStandardDeviation: number;
    manufacturerExpirationDate: string;
    openVialDate?: string;
    openVialStabilityDays?: number;
  }) {
    return labApiClient.post<QcLotItem>('/qc/lots', payload);
  },

  async recordQcRun(payload: {
    qcLotId: string;
    measuredValue: number;
    medTechName: string;
    runAt?: string;
    peerLevelZScore?: number;
    notes?: string;
  }) {
    return labApiClient.post<QcRunItem>('/qc/runs', payload);
  },

  async getLeveyJenningsChart(lotId?: string, analyteCode?: string, level?: string) {
    const params = new URLSearchParams();
    if (lotId) params.append('lotId', lotId);
    if (analyteCode) params.append('analyteCode', analyteCode);
    if (level) params.append('level', level);
    return labApiClient.get<LeveyJenningsChartData>(`/qc/chart?${params.toString()}`);
  },

  // Scope 4: Statutory Reports, PDF Generation, Panic Dispatch
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
  },

  async recordPanicDispatch(requisitionId: string, payload: {
    dispatchedByMedTechName: string;
    notifiedDoctorName: string;
    notificationMethod?: string;
    readbackConfirmed?: boolean;
    readbackNotes?: string;
  }) {
    return labApiClient.post<CriticalPanicDispatchLogItem>(`/reports/${requisitionId}/panic-dispatch`, payload);
  },

  async getPanicAlerts(limit = 50) {
    return labApiClient.get<CriticalPanicDispatchLogItem[]>(`/reports/panic-alerts?limit=${limit}`);
  },

  getReportPdfDownloadUrl(requisitionId: string) {
    const baseUrl = process.env.EXPO_PUBLIC_LAB_API_URL ?? 'http://localhost:5245';
    return joinApiUrl(baseUrl, `/reports/${requisitionId}/pdf`);
  },

  getReportHtmlPreviewUrl(requisitionId: string) {
    const baseUrl = process.env.EXPO_PUBLIC_LAB_API_URL ?? 'http://localhost:5245';
    return joinApiUrl(baseUrl, `/reports/${requisitionId}/preview-html`);
  },

  // Scope 5: Facility Licensing & On-Premise Staff Roster
  async getLicenseStatus() {
    return labApiClient.get<LabLicenseStatus>('/license');
  },

  async applyLicense(licenseToken: string) {
    return labApiClient.post<LabLicenseStatus>('/license/apply', { licenseToken });
  },

  async getStaff(role?: LabStaffRole, isActive?: boolean) {
    const params = new URLSearchParams();
    if (role) params.append('role', role);
    if (typeof isActive === 'boolean') params.append('isActive', String(isActive));
    const qs = params.toString();
    return labApiClient.get<LabStaffMember[]>(`/staff${qs ? `?${qs}` : ''}`);
  },

  async createStaff(payload: CreateLabStaffPayload) {
    return labApiClient.post<LabStaffMember>('/staff', payload);
  },

  async updateStaff(id: string, payload: Partial<CreateLabStaffPayload>) {
    return labApiClient.put<LabStaffMember>(`/staff/${id}`, payload);
  },

  async deactivateStaff(id: string) {
    return labApiClient.delete(`/staff/${id}`);
  }
};

export type LabStaffRole =
  | 'Pathologist'
  | 'MedicalTechnologist'
  | 'LaboratoryTechnician'
  | 'Phlebotomist'
  | 'LaboratoryAide';

export interface LabStaffMember {
  id: string;
  tenantId: string;
  laboratoryId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  role: LabStaffRole;
  email?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  ptrNumber?: string;
  specialty?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateLabStaffPayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  role: LabStaffRole;
  email?: string;
  phoneNumber?: string;
  prcLicenseNumber?: string;
  ptrNumber?: string;
  specialty?: string;
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

export interface LabLicenseStatus {
  status: 'Active' | 'ActivationRequired' | 'Expired' | 'Tampered';
  laboratoryId: string;
  laboratoryName: string;
  planTier: string;
  limits: FacilityLimits;
  activeStaffCount: number;
  enabledFeatures: string[];
  expiresAtUtc?: string;
  isTampered: boolean;
  errorMessage?: string;
}
