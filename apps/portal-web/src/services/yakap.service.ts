import { apiClient } from "@/transport/apiClient";

export interface PortalEligibleYakapEncounter {
  encounterId: string;
  patientId: string;
  patientName: string;
  philHealthIdentificationNumber?: string;
  encounterDate: string;
  doctorName: string;
  primaryDiagnosis?: string;
  diagnosesCount: number;
  prescriptionsCount: number;
  diagnosticsCount: number;
  isYakapEligible: boolean;
  hasPhilHealthPin: boolean;
  totalMedicationAmount: number;
}

export interface PortalYakapTransmittalItem {
  id: string;
  yakapTransmittalId: string;
  patientId: string;
  patientName: string;
  philHealthIdentificationNumber: string;
  consultationEncounterId?: string;
  encounterDate?: string;
  itemType: string;
  reportStatus: string;
  deficiencyRemarks?: string;
}

export interface PortalYakapTransmittal {
  id: string;
  transmittalNumber: string;
  reportTagging: string;
  effectiveYear: string;
  packageType: string;
  status: string;
  philHealthTransactionNumber?: string;
  encryptedPayloadHash?: string;
  validationErrors: string[];
  submittedAt?: string;
  submittedBy?: string;
  createdAt: string;
  totalItemsCount: number;
  items: PortalYakapTransmittalItem[];
  branchId?: string;
}

export interface PortalCreateTransmittalPayload {
  consultationEncounterIds?: string[];
  reportTagging: string;
  effectiveYear?: string;
}

export interface PortalValidationResult {
  transmittalId: string;
  isValid: boolean;
  transmittalNumber?: string;
  rawXml?: string;
  validationErrors: string[];
}

export interface PortalSubmissionResult {
  transmittalId: string;
  isSuccess: boolean;
  transmittalNumber: string;
  transactionNumber?: string;
  validationErrors: string[];
}

export const yakapService = {
  async getEligibleEncounters(
    branchId: string,
    reportTagging: string = "2",
    startDate?: string,
    endDate?: string
  ): Promise<PortalEligibleYakapEncounter[]> {
    let url = `/yakap/branches/${branchId}/eligible-encounters?reportTagging=${encodeURIComponent(reportTagging)}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

    const res = await apiClient.get<{ data: PortalEligibleYakapEncounter[] }>(url);
    return res.data?.data || [];
  },

  async getTransmittals(
    branchId: string,
    status?: string,
    reportTagging?: string
  ): Promise<PortalYakapTransmittal[]> {
    let url = `/yakap/branches/${branchId}/transmittals`;
    const params: string[] = [];
    if (status && status !== "all") params.push(`status=${encodeURIComponent(status)}`);
    if (reportTagging && reportTagging !== "all") params.push(`reportTagging=${encodeURIComponent(reportTagging)}`);
    if (params.length > 0) url += `?${params.join("&")}`;

    const res = await apiClient.get<{ data: PortalYakapTransmittal[] }>(url);
    return res.data?.data || [];
  },

  async getTransmittalById(id: string): Promise<PortalYakapTransmittal | null> {
    const res = await apiClient.get<{ data: PortalYakapTransmittal }>(`/yakap/transmittals/${id}`);
    return res.data?.data || null;
  },

  async getTransmittalXml(id: string): Promise<string> {
    const res = await apiClient.get<{ data: string }>(`/yakap/transmittals/${id}/xml`);
    return res.data?.data || "";
  },

  async createTransmittal(
    branchId: string,
    payload: PortalCreateTransmittalPayload
  ): Promise<PortalYakapTransmittal> {
    const res = await apiClient.post<{ data: PortalYakapTransmittal }>(
      `/yakap/branches/${branchId}/transmittals`,
      payload
    );
    return res.data?.data;
  },

  async validateTransmittal(id: string): Promise<PortalValidationResult> {
    const res = await apiClient.post<{ data: PortalValidationResult }>(
      `/yakap/transmittals/${id}/validate`,
      {}
    );
    return res.data?.data;
  },

  async submitTransmittal(branchId: string, id: string): Promise<PortalSubmissionResult> {
    const res = await apiClient.post<{ data: PortalSubmissionResult }>(
      `/yakap/branches/${branchId}/transmittals/${id}/submit`,
      {}
    );
    return res.data?.data;
  },
};
