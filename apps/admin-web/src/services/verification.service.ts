import { apiClient } from "@/lib/api";
import type { AdminMeDto } from "@/services/admin.service";
import {
  ADMIN_PERMISSIONS,
  canRevokeDirectoryVerification,
  canVerifyDirectory,
  canViewVerifications,
  hasAdminPermission,
} from "@/constants/permissions";
import type {
  PlatformVerificationStatus,
  PractitionerVerificationLevel,
  ScheduleWindowLike,
} from "@/lib/verificationStatus";

export const VERIFICATION_PERMISSIONS = {
  VIEW: ADMIN_PERMISSIONS.VIEW_VERIFICATIONS,
  VERIFY: ADMIN_PERMISSIONS.VERIFY_DIRECTORY,
  REVOKE: ADMIN_PERMISSIONS.REVOKE_DIRECTORY_VERIFICATION,
} as const;

export type VerificationPermission =
  (typeof VERIFICATION_PERMISSIONS)[keyof typeof VERIFICATION_PERMISSIONS];

export type ReviewerProfile = AdminMeDto;

export {
  hasAdminPermission as hasVerificationPermission,
  canViewVerifications,
  canVerifyDirectory,
  canRevokeDirectoryVerification,
};

export interface VerificationQueueParams {
  kind?: "all" | "facility" | "practitioner" | string;
  status?: string;
  q?: string;
  search?: string;
}

export interface VerificationQueueItemDto {
  id: string;
  kind: "Facility" | "Practitioner" | string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  facilityId: string;
  facilityName: string;
  facilitySlug: string | null;
  submissionNumber: number;
  requestKind: string;
  status: string;
  submittedAtUtc: string;
  submittedByDisplayName: string | null;
  dohLtoNumber: string | null;
  ltoEvidenceObjectKey: string | null;
  facilityVerificationRequestId: string | null;
  practitionerId: string | null;
  clinicStaffMemberId: string | null;
  practitionerName: string | null;
  professionKind: string | null;
  prcLicenseNo: string | null;
  normalizedPrcLicenseNo: string | null;
  prcExpiryDate: string | null;
  prcEvidenceObjectKey: string | null;
  hasNameMismatch: boolean;
  bundledPractitionerCount: number;
  reviewedAtUtc: string | null;
  reviewedByAdminUserId: string | null;
  reviewerNotes: string | null;
  dohLtoExpiryDate?: string | null;
  reviewedByDisplayName?: string | null;
  reviewedByEmail?: string | null;
  updatedAtUtc?: string | null;
}

export interface VerificationQueueResponse {
  items: VerificationQueueItemDto[];
  totalCount: number;
  pendingCount: number;
  pendingFacilityCount: number;
  pendingPractitionerCount: number;
}

export interface PrcMatchCandidateDto {
  practitionerId: string;
  professionKind: string;
  normalizedPrcLicenseNo: string;
  displayPrcLicenseNo: string;
  firstName: string;
  lastName: string;
  title: string | null;
  primarySpecialty: string;
  verificationStatus: PractitionerVerificationLevel;
  prcExpiryDate: string | null;
  verifiedAtUtc: string | null;
  isCompatibleNameMatch: boolean;
  affiliatedFacilityCount: number;
  affiliatedClinics: string[];
}

export interface ChildPractitionerRequestDetailDto {
  id: string;
  clinicStaffMemberId: string;
  practitionerId: string | null;
  affiliationId: string | null;
  submissionNumber: number;
  requestKind: string;
  professionKind: string;
  firstName: string;
  lastName: string;
  title: string | null;
  submittedPrcLicenseNo: string;
  normalizedPrcLicenseNo: string;
  prcExpiryDate: string | null;
  prcEvidenceObjectKey: string | null;
  verificationContact: string | null;
  specialty: string | null;
  publicBio: string | null;
  avatarUrl: string | null;
  status: string;
  hasNameMismatch: boolean;
  prcMatchCandidates: PrcMatchCandidateDto[];
  availabilities: ScheduleWindowLike[];
}

export interface VerificationSubmissionHistoryItemDto {
  id: string;
  submissionNumber: number;
  requestKind: string;
  status: string;
  submittedAtUtc: string;
  reviewedAtUtc: string | null;
  reviewedByAdminUserId: string | null;
  reviewerNotes: string | null;
  withdrawnAtUtc: string | null;
  withdrawalReason: string | null;
  reviewedByDisplayName?: string | null;
  reviewedByEmail?: string | null;
}

export interface FieldChangeDto {
  fieldKey: string;
  label: string;
  previousValue: string | null;
  currentValue: string | null;
  changeKind: string;
}

export interface ResubmissionDiffDto {
  previousRequestId: string;
  previousSubmissionNumber: number;
  previousStatus: string;
  previousSubmittedAtUtc: string;
  previousReason: string | null;
  ltoProofUpdated: boolean;
  prcProofUpdated: boolean;
  updatedChildPractitionerIds: string[];
  updatedChildPrcProofIds: string[];
  changedFields: FieldChangeDto[];
}

export interface VerificationRequestDetailDto {
  id: string;
  kind: "Facility" | "Practitioner" | string;
  status: string;
  requestKind: string;
  submissionNumber: number;
  correlationId: string;
  submittedAtUtc: string;
  submittedByClinicUserId: string | null;
  submittedByDisplayName: string | null;
  reviewedAtUtc: string | null;
  reviewedByAdminUserId: string | null;
  reviewerNotes: string | null;
  withdrawnAtUtc: string | null;
  withdrawnByActor: string | null;
  withdrawalReason: string | null;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  facilityId: string;
  facilityName: string;
  facilitySlug: string | null;
  facilityVerificationStatus: PlatformVerificationStatus;
  dohLtoNumber: string | null;
  evidenceObjectKey: string | null;
  ltoEvidenceObjectKey: string | null;
  prcEvidenceObjectKey: string | null;
  submittedSnapshotJson: string;
  snapshot: Record<string, unknown> | null;
  hasNameMismatch: boolean;
  childPractitionerRequests: ChildPractitionerRequestDetailDto[];
  prcMatchCandidates: PrcMatchCandidateDto[];
  submissionHistory: VerificationSubmissionHistoryItemDto[];
  dohLtoExpiryDate?: string | null;
  reviewedByDisplayName?: string | null;
  reviewedByEmail?: string | null;
  clinicContactNumber?: string | null;
  clinicContactEmail?: string | null;
  philHealthAccreditationNumber?: string | null;
  isPhilHealthAccredited?: boolean;
  supportsInPerson?: boolean;
  supportsTeleconsult?: boolean;
  updatedAtUtc?: string | null;
  resubmissionDiff?: ResubmissionDiffDto | null;
  canonicalPractitionerId?: string | null;
  canonicalPractitionerStatus?: PractitionerVerificationLevel | null;
  otpExpiresAtUtc?: string | null;
  verificationContact?: string | null;
}

export interface ResendAffiliationConfirmationResult {
  requestId: string;
  sentTo: string;
  expiresAtUtc: string;
  resentAtUtc: string;
}

export interface ApproveVerificationPayload {
  notes?: string;
  practitionerRequestIds?: string[];
  approveBundledPractitioners?: boolean;
}

export interface ApproveVerificationResult {
  requestId: string;
  kind: string;
  status: string;
  facilityId: string;
  approvedPractitionerIds: string[];
  reviewedAtUtc: string;
}

export interface RejectVerificationPayload {
  reason: string;
  notes?: string;
}

export interface RejectVerificationResult {
  requestId: string;
  kind: string;
  status: string;
  facilityId: string;
  reason: string;
  reviewedAtUtc: string;
}

export interface SuspendPractitionerPayload {
  reason: string;
}

export interface SuspendPractitionerResult {
  practitionerId: string;
  status: PractitionerVerificationLevel;
  suspendedAffiliationsCount: number;
  revokedAtUtc: string;
  closedPendingRequestsCount?: number;
}

export interface ReinstatePractitionerPayload {
  reason: string;
}

export interface ReinstatePractitionerResult {
  practitionerId: string;
  status: PractitionerVerificationLevel;
  reinstatedAffiliationsCount: number;
  reinstatedAtUtc: string;
}

export interface VerificationEvidenceBlobResult {
  blob: Blob;
  contentType: string;
  fileName: string;
}

export interface FetchVerificationEvidenceOptions {
  kind?: "lto" | "prc";
  childRequestId?: string;
}

function parseFilenameFromContentDisposition(header?: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1]?.trim() || null;
}

async function extractBlobErrorMessage(error: unknown): Promise<string | null> {
  const response = (error as { response?: { data?: unknown } })?.response;
  const data = response?.data;
  if (!data) return null;

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const text = await data.text();
      if (!text.trim()) return null;
      const parsed = JSON.parse(text) as { message?: string; Message?: string };
      return parsed.message || parsed.Message || null;
    } catch {
      return null;
    }
  }

  if (typeof data === "object") {
    const obj = data as { message?: string; Message?: string };
    return obj.message || obj.Message || null;
  }

  return null;
}

export const verificationService = {
  /** Fetches the signed-in admin reviewer profile and scopes (`GET /admin/me`). Returns null on 401/403. */
  getReviewerProfile: async (): Promise<ReviewerProfile | null> => {
    try {
      const res = await apiClient.get<ReviewerProfile>("/admin/me");
      return res.data;
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        return null;
      }
      throw error;
    }
  },

  /** Lists clinic and practitioner verification queue requests (`GET /admin/verification-queue`). */
  getVerificationQueue: async (
    params: VerificationQueueParams = {},
  ): Promise<VerificationQueueResponse> => {
    const searchParams = new URLSearchParams();
    if (params.kind && params.kind !== "all") {
      searchParams.set("kind", params.kind);
    }
    if (params.status && params.status !== "all") {
      searchParams.set("status", params.status);
    }
    const term = params.q?.trim() || params.search?.trim();
    if (term) {
      searchParams.set("q", term);
    }
    const qs = searchParams.toString();
    const res = await apiClient.get<VerificationQueueResponse>(
      `/admin/verification-queue${qs ? `?${qs}` : ""}`,
    );
    return res.data;
  },

  /** Fetches verification snapshot, PRC match candidates, and submission history (`GET /admin/verification-queue/{requestId}`). */
  getVerificationRequestDetail: async (requestId: string): Promise<VerificationRequestDetailDto> => {
    const res = await apiClient.get<VerificationRequestDetailDto>(
      `/admin/verification-queue/${encodeURIComponent(requestId)}`,
    );
    return res.data;
  },

  /** Streams an uploaded DOH LTO or PRC proof document as an authenticated Blob (`GET /admin/verification-queue/{requestId}/evidence`). */
  fetchVerificationEvidence: async (
    requestId: string,
    options: FetchVerificationEvidenceOptions = {},
  ): Promise<VerificationEvidenceBlobResult> => {
    const searchParams = new URLSearchParams();
    if (options.kind) {
      searchParams.set("kind", options.kind);
    }
    if (options.childRequestId) {
      searchParams.set("childRequestId", options.childRequestId);
    }
    const qs = searchParams.toString();
    let res;
    try {
      res = await apiClient.get<Blob>(
        `/admin/verification-queue/${encodeURIComponent(requestId)}/evidence${qs ? `?${qs}` : ""}`,
        { responseType: "blob" },
      );
    } catch (error: unknown) {
      const parsedMessage = await extractBlobErrorMessage(error);
      if (parsedMessage) {
        throw new Error(parsedMessage);
      }
      throw error;
    }
    const headers = (res.headers ?? {}) as Record<string, string | undefined>;
    const contentType =
      res.data?.type ||
      headers["content-type"] ||
      headers["Content-Type"] ||
      "application/octet-stream";
    const fileName =
      parseFilenameFromContentDisposition(
        headers["content-disposition"] || headers["Content-Disposition"],
      ) || (options.kind === "prc" ? "prc-proof" : "doh-lto-proof");
    const blob =
      res.data instanceof Blob && res.data.type
        ? res.data
        : new Blob([res.data], { type: contentType });
    return { blob, contentType, fileName };
  },

  /** Approves a clinic or practitioner verification request (`POST /admin/verification-queue/{requestId}/approve`). */
  approveVerificationRequest: async (
    requestId: string,
    payload: ApproveVerificationPayload = {},
  ): Promise<ApproveVerificationResult> => {
    const res = await apiClient.post<ApproveVerificationResult>(
      `/admin/verification-queue/${encodeURIComponent(requestId)}/approve`,
      payload,
    );
    return res.data;
  },

  /** Rejects a clinic or practitioner verification request with a mandatory reason (`POST /admin/verification-queue/{requestId}/reject`). */
  rejectVerificationRequest: async (
    requestId: string,
    payload: RejectVerificationPayload,
  ): Promise<RejectVerificationResult> => {
    const reason = payload.reason?.trim();
    if (!reason) {
      throw new Error("A rejection reason is required.");
    }
    const res = await apiClient.post<RejectVerificationResult>(
      `/admin/verification-queue/${encodeURIComponent(requestId)}/reject`,
      {
        reason,
        notes: payload.notes?.trim() || undefined,
      },
    );
    return res.data;
  },

  /** Rotates the confirmation token/OTP and resends the practitioner affiliation confirmation email (`POST /admin/verification-queue/{requestId}/resend-confirmation`). */
  resendAffiliationConfirmation: async (
    requestId: string,
  ): Promise<ResendAffiliationConfirmationResult> => {
    const res = await apiClient.post<ResendAffiliationConfirmationResult>(
      `/admin/verification-queue/${encodeURIComponent(requestId)}/resend-confirmation`,
    );
    return res.data;
  },

  /** Suspends a verified practitioner across all active clinic affiliations (`POST /admin/practitioners/{id}/suspend`). */
  suspendPractitioner: async (
    practitionerId: string,
    payload: SuspendPractitionerPayload,
  ): Promise<SuspendPractitionerResult> => {
    const reason = payload.reason?.trim();
    if (!reason) {
      throw new Error("A compliance reason is required to suspend a practitioner.");
    }
    const res = await apiClient.post<SuspendPractitionerResult>(
      `/admin/practitioners/${encodeURIComponent(practitionerId)}/suspend`,
      { reason },
    );
    return res.data;
  },

  /** Reinstates a suspended practitioner across affiliated clinics (`POST /admin/practitioners/{id}/reinstate`). */
  reinstatePractitioner: async (
    practitionerId: string,
    payload: ReinstatePractitionerPayload,
  ): Promise<ReinstatePractitionerResult> => {
    const reason = payload.reason?.trim();
    if (!reason) {
      throw new Error("A compliance reason is required to reinstate a practitioner.");
    }
    const res = await apiClient.post<ReinstatePractitionerResult>(
      `/admin/practitioners/${encodeURIComponent(practitionerId)}/reinstate`,
      { reason },
    );
    return res.data;
  },
};
