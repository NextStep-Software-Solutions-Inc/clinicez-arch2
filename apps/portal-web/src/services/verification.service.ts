import { apiClient } from "@/transport/apiClient";
import type { PlatformVerificationStatus } from "@/lib/wire";

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

export interface EvidenceBlobResult {
  blob: Blob;
  contentType: string;
  fileName: string;
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

  /** Fetches the uploaded DOH LTO proof file as an authenticated Blob for inline viewing (`GET /facilities/{id}/lto-proof`). */
  fetchFacilityLtoProof: async (
    facilityId: string,
    tenantSlug?: string,
  ): Promise<EvidenceBlobResult> => {
    const qs = tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : "";
    let res;
    try {
      res = await apiClient.get<Blob>(
        `/facilities/${encodeURIComponent(facilityId)}/lto-proof${qs}`,
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
      ) || "doh-lto-proof";
    const blob =
      res.data instanceof Blob && res.data.type
        ? res.data
        : new Blob([res.data], { type: contentType });
    return { blob, contentType, fileName };
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
