import { apiClient } from "@/transport/apiClient";
import type { PlatformVerificationStatus, PractitionerVerificationLevel } from "@/lib/wire";
import type { ScheduleWindowLike } from "@/lib/verificationStatus";

export const VERIFICATION_PERMISSIONS = {
  VIEW: "view:verifications",
  VERIFY: "verify:directory",
  REVOKE: "verify:revoke",
} as const;

export type VerificationPermission =
  (typeof VERIFICATION_PERMISSIONS)[keyof typeof VERIFICATION_PERMISSIONS];

export interface ReviewerProfile {
  isAdmin: boolean;
  fullName: string;
  email: string;
  roleName: string;
  permissions: string[];
}

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
  reason?: string;
}

export interface SuspendPractitionerResult {
  practitionerId: string;
  status: PractitionerVerificationLevel;
  suspendedAffiliationsCount: number;
  revokedAtUtc: string;
}

export interface FacilityVerificationPractitionerSummary {
  requestId: string;
  clinicStaffMemberId: string;
  practitionerId: string | null;
  name: string;
  professionKind: string;
  normalizedPrcLicenseNo: string;
  status: string;
  reviewerNotes: string | null;
}

export interface FacilityVerificationStatusDto {
  facilityId: string;
  platformVerificationStatus: PlatformVerificationStatus;
  isPatientDiscoveryEligible: boolean;
  isPlatformVerified: boolean;
  ltoEvidenceObjectKey: string | null;
  latestVerificationRequestId: string | null;
  verifiedAtUtc: string | null;
  rejectionReason: string | null;
  latestRequest: {
    id: string;
    submissionNumber: number;
    requestKind: string;
    status: string;
    submittedAtUtc: string;
    reviewedAtUtc: string | null;
    reviewerNotes: string | null;
    withdrawnAtUtc: string | null;
    withdrawalReason: string | null;
  } | null;
  practitioners: FacilityVerificationPractitionerSummary[];
}

export interface UploadLtoProofJsonPayload {
  objectKey?: string;
  ltoEvidenceObjectKey?: string;
  tenantSlug?: string;
}

export interface UploadLtoProofResult {
  objectKey: string;
  facilityId: string;
  ltoEvidenceObjectKey: string;
}

export interface AffiliationConfirmationInfoDto {
  requestId: string;
  practitionerId: string | null;
  practitionerName: string;
  professionKind: string;
  facilityId: string;
  facilityName: string;
  specialty: string | null;
  status: string;
  expiresAtUtc: string | null;
  alreadyConfirmed: boolean;
  isExpired: boolean;
  requiresOtpCode: boolean;
}

export interface AffiliationConfirmationResultDto {
  requestId: string;
  practitionerId: string;
  affiliationId: string;
  facilityId: string;
  facilityName: string;
  affiliationStatus: string;
  alreadyConfirmed: boolean;
  confirmedAtUtc: string;
}

interface ApiEnvelope<T> {
  succeeded?: boolean;
  success?: boolean;
  message?: string | null;
  data?: T;
}

function unwrapApiEnvelope<T>(payload: ApiEnvelope<T> | T, fallbackError: string): T {
  if (payload && typeof payload === "object" && ("data" in payload || "succeeded" in payload)) {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.succeeded === false) {
      throw new Error(envelope.message || fallbackError);
    }
    if (envelope.data !== undefined) {
      return envelope.data;
    }
  }
  return payload as T;
}

export function hasVerificationPermission(
  profile: ReviewerProfile | null | undefined,
  permission: string,
): boolean {
  if (!profile || !Array.isArray(profile.permissions)) return false;
  return profile.permissions.includes(permission);
}

export function canViewVerifications(profile: ReviewerProfile | null | undefined): boolean {
  return hasVerificationPermission(profile, VERIFICATION_PERMISSIONS.VIEW);
}

export function canVerifyDirectory(profile: ReviewerProfile | null | undefined): boolean {
  return hasVerificationPermission(profile, VERIFICATION_PERMISSIONS.VERIFY);
}

export function canRevokeDirectoryVerification(profile: ReviewerProfile | null | undefined): boolean {
  return hasVerificationPermission(profile, VERIFICATION_PERMISSIONS.REVOKE);
}

export const verificationService = {
  /** Fetches the signed-in portal reviewer profile and scopes (`GET /admin/me`). Returns null on 401/403. */
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

  /** Suspends a verified practitioner across all active clinic affiliations (`POST /admin/practitioners/{id}/suspend`). */
  suspendPractitioner: async (
    practitionerId: string,
    payload: SuspendPractitionerPayload = {},
  ): Promise<SuspendPractitionerResult> => {
    const res = await apiClient.post<SuspendPractitionerResult>(
      `/admin/practitioners/${encodeURIComponent(practitionerId)}/suspend`,
      payload.reason?.trim() ? { reason: payload.reason.trim() } : {},
    );
    return res.data;
  },

  /** Fetches directory verification status and latest submission summary for a facility (`GET /facilities/{id}/verification-status`). */
  getFacilityVerificationStatus: async (
    facilityId: string,
    tenantSlug?: string,
  ): Promise<FacilityVerificationStatusDto> => {
    const qs = tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : "";
    const res = await apiClient.get<FacilityVerificationStatusDto>(
      `/facilities/${encodeURIComponent(facilityId)}/verification-status${qs}`,
    );
    return res.data;
  },

  /** Uploads a DOH LTO proof file or records an existing object key (`POST /facilities/{id}/lto-proof`). */
  uploadFacilityLtoProof: async (
    facilityId: string,
    input: File | UploadLtoProofJsonPayload,
    tenantSlug?: string,
  ): Promise<UploadLtoProofResult> => {
    const resolvedSlug =
      tenantSlug ?? (input instanceof File ? undefined : input.tenantSlug);
    const qs = resolvedSlug ? `?tenantSlug=${encodeURIComponent(resolvedSlug)}` : "";

    if (typeof File !== "undefined" && input instanceof File) {
      const formData = new FormData();
      formData.append("file", input);
      if (resolvedSlug) {
        formData.append("tenantSlug", resolvedSlug);
      }
      const res = await apiClient.post<UploadLtoProofResult>(
        `/facilities/${encodeURIComponent(facilityId)}/lto-proof${qs}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return res.data;
    }

    const res = await apiClient.post<UploadLtoProofResult>(
      `/facilities/${encodeURIComponent(facilityId)}/lto-proof${qs}`,
      input,
    );
    return res.data;
  },

  /** Inspects a public practitioner affiliation confirmation token (`GET /public/practitioners/confirm-affiliation`). */
  getAffiliationConfirmation: async (
    token: string,
  ): Promise<AffiliationConfirmationInfoDto> => {
    const res = await apiClient.get<ApiEnvelope<AffiliationConfirmationInfoDto>>(
      `/public/practitioners/confirm-affiliation?token=${encodeURIComponent(token)}`,
    );
    return unwrapApiEnvelope(res.data, "Unable to load affiliation confirmation details.");
  },

  /** Confirms a practitioner's clinic affiliation with token and optional OTP code (`POST /public/practitioners/confirm-affiliation`). */
  confirmPractitionerAffiliation: async (
    token: string,
    otpCode?: string,
  ): Promise<AffiliationConfirmationResultDto> => {
    const res = await apiClient.post<ApiEnvelope<AffiliationConfirmationResultDto>>(
      "/public/practitioners/confirm-affiliation",
      {
        token: token.trim(),
        otpCode: otpCode?.trim() || undefined,
      },
    );
    return unwrapApiEnvelope(res.data, "Unable to confirm practitioner affiliation.");
  },
};
