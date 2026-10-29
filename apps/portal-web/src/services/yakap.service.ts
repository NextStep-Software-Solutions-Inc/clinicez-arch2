import { apiClient } from "@/transport/apiClient";

/**
 * PhilHealth YAKAP 2.0 Zero-PHI Contracts & Telemetry Services.
 *
 * Strict Privacy Invariant:
 * HQ Portal Web monitors branch telemetry and submission state machines.
 * Under RA 10173 & PhilHealth PCAPI v2.0, ZERO patient names, PINs, or raw clinical XML
 * are ever ingested, processed, or exposed across HQ telemetry endpoints.
 */

export interface PortalYakapBranchSummaryDto {
  branchId: string;
  accreditationNo?: string | null;
  empaneledCount: number;
  selectedCount: number;
  acceptedUploadsCount: number;
  pendingPollingCount: number;
  rejectedOrFailedCount: number;
  submissionsByType: Record<string, number>;
  lastMasterlistSyncAtUtc?: string | null;
  masterlistTotalCount: number;
}

export interface PortalYakapSubmissionErrorDto {
  fieldPath: string;
  issue: string;
  errorCode?: string | null;
}

export interface PortalYakapSubmissionDto {
  id: string;
  patientCode: string; // Zero-PHI anonymized code (e.g. "PAT-0123")
  accreditationNo: string;
  caseNo: string;
  submissionType: string; // "FPE" | "Consultation" | "Diagnostic" | "Medicine" | "Referral"
  reportStatus: string; // "U" | "V" | "F"
  localTransactionNo: string; // 23B local tx (E..., C...)
  uploadTransactionNo?: string | null; // 23B PhilHealth upload tx (U...)
  yesReferenceNo?: string | null; // PhilHealth reference (MCA...)
  processingStatus: string; // "Pending" | "Submitted" | "Accepted" | "Rejected" | "Failed"
  payloadSha256Hash?: string | null;
  submittedAtUtc?: string | null;
  lastPolledAtUtc?: string | null;
  completedAtUtc?: string | null;
  attemptCount: number;
  lastErrorMessage?: string | null;
  errors: PortalYakapSubmissionErrorDto[];
}

export interface PortalYakapMasterlistSyncResultDto {
  success: boolean;
  recordsAdded: number;
  recordsUpdated: number;
  totalActiveCount: number;
  syncedAtUtc: string;
  message?: string | null;
}

export const yakapService = {
  async getBranchSummary(branchId: string): Promise<PortalYakapBranchSummaryDto> {
    const res = await apiClient.get<any>(`/yakap/branches/${branchId}/summary`);
    return res.data?.data || res.data;
  },

  async getSubmissions(
    branchId: string,
    filters?: { status?: string; submissionType?: string; page?: number; pageSize?: number }
  ): Promise<PortalYakapSubmissionDto[]> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== "all") params.set("status", filters.status);
    if (filters?.submissionType && filters.submissionType !== "all") params.set("submissionType", filters.submissionType);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));
    const qs = params.toString() ? `?${params.toString()}` : "";

    const res = await apiClient.get<any>(`/yakap/branches/${branchId}/submissions${qs}`);
    return res.data?.data || res.data || [];
  },

  async getSubmissionById(branchId: string, id: string): Promise<PortalYakapSubmissionDto> {
    const res = await apiClient.get<any>(`/yakap/branches/${branchId}/submissions/${id}`);
    return res.data?.data || res.data;
  },

  async pollSubmissionStatus(branchId: string, id: string): Promise<PortalYakapSubmissionDto> {
    const res = await apiClient.post<any>(`/yakap/branches/${branchId}/submissions/${id}/poll`, {});
    return res.data?.data || res.data;
  },

  async retrySubmission(branchId: string, id: string): Promise<PortalYakapSubmissionDto> {
    const res = await apiClient.post<any>(`/yakap/branches/${branchId}/submissions/${id}/retry`, {});
    return res.data?.data || res.data;
  },

  async syncMasterlist(branchId: string): Promise<PortalYakapMasterlistSyncResultDto> {
    const res = await apiClient.post<any>(`/yakap/branches/${branchId}/masterlist/sync`, {});
    return res.data?.data || res.data;
  },
};
