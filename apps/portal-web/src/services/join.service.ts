import { joinApiUrl } from "@shared/safe";
import { getPortalApiUrl } from "@/utils/domain";

export interface JoinCodeValidationResult {
  success: boolean;
  tenantSlug?: string;
  tenantName?: string;
  facilitySlug?: string;
  facilityName?: string;
  facilityAddress?: string;
  operatingHours?: string;
  expiresAt?: string;
  message?: string;
  errorCode?: string;
  statusCode?: number;
}

export const joinService = {
  /**
   * Validates a clinic join code against portal-api without exposing
   * tenant or branch enumeration endpoints. Resolves the authorized tenant and facility.
   */
  validateJoinCode: async (code: string): Promise<JoinCodeValidationResult> => {
    if (!code || !code.trim()) {
      return {
        success: false,
        message: "Join code is required.",
        errorCode: "REQUIRED_FIELD_MISSING",
        statusCode: 400,
      };
    }

    const cleanToken = code.trim();
    const lower = cleanToken.toLowerCase();
    if (
      lower.startsWith("rx-") ||
      lower.startsWith("mc-") ||
      lower.startsWith("ref-") ||
      lower.startsWith("lab-") ||
      lower.startsWith("sec-sha256-") ||
      (cleanToken.length === 65 && cleanToken[32] === ".") ||
      (cleanToken.length >= 50 && cleanToken.length <= 60 && cleanToken.indexOf(".") === 32)
    ) {
      return {
        success: false,
        message: "The entered code belongs to a clinical document, not a clinic join intake passcode.",
        errorCode: "DOCUMENT_KIND_MISMATCH",
        statusCode: 400,
      };
    }

    const cleanCode = code.trim().toUpperCase();
    const portalApiUrl = getPortalApiUrl();
    const targetUrl = joinApiUrl(
      portalApiUrl,
      `/public/join/validate/${encodeURIComponent(cleanCode)}`
    );

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      const statusCode = res.status;

      if (res.ok && (json.succeeded || json.success || json.data?.isValid)) {
        const d = json.data || json;
        return {
          success: true,
          statusCode,
          tenantSlug: d.tenantSlug,
          tenantName: d.tenantName,
          facilitySlug: d.facilitySlug,
          facilityName: d.facilityName,
          facilityAddress: d.facilityAddress,
          operatingHours: d.operatingHours,
          expiresAt: d.expiresAt,
        };
      }

      const errorCode =
        json.errorCode ||
        json.errors?.[0]?.code ||
        (statusCode === 403
          ? "JOIN_DISABLED"
          : statusCode === 410
          ? "JOIN_CODE_EXPIRED"
          : statusCode === 409
          ? "JOIN_CODE_AMBIGUOUS"
          : statusCode === 404
          ? "NOT_FOUND"
          : "ERROR");

      return {
        success: false,
        statusCode,
        errorCode,
        message: json.message || "Invalid or expired clinic join code.",
      };
    } catch (_err) {
      return {
        success: false,
        statusCode: 500,
        errorCode: "NETWORK_ERROR",
        message: "Unable to verify join code with clinic service. Please try again or ask reception.",
      };
    }
  },

  /**
   * Retrieves public facility join metadata by tenant slug and facility slug directly from portal-api.
   */
  getFacilityJoinData: async (
    tenantSlug: string,
    facilitySlug: string
  ): Promise<JoinCodeValidationResult> => {
    if (!tenantSlug?.trim() || !facilitySlug?.trim()) {
      return {
        success: false,
        message: "Tenant slug and facility slug are required.",
        errorCode: "REQUIRED_FIELD_MISSING",
        statusCode: 400,
      };
    }

    const cleanTenant = tenantSlug.trim().toLowerCase();
    const cleanFacility = facilitySlug.trim().toLowerCase();
    const portalApiUrl = getPortalApiUrl();
    const targetUrl = joinApiUrl(
      portalApiUrl,
      `/public/join/facility/${encodeURIComponent(cleanTenant)}/${encodeURIComponent(cleanFacility)}`
    );

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      const statusCode = res.status;

      if (res.ok && (json.succeeded || json.success || json.data?.isValid)) {
        const d = json.data || json;
        return {
          success: true,
          statusCode,
          tenantSlug: d.tenantSlug,
          tenantName: d.tenantName,
          facilitySlug: d.facilitySlug,
          facilityName: d.facilityName,
          facilityAddress: d.facilityAddress,
          operatingHours: d.operatingHours,
          expiresAt: d.expiresAt,
        };
      }

      const errorCode =
        json.errorCode ||
        json.errors?.[0]?.code ||
        (statusCode === 403
          ? "JOIN_DISABLED"
          : statusCode === 410
          ? "JOIN_CODE_EXPIRED"
          : statusCode === 409
          ? "JOIN_CODE_AMBIGUOUS"
          : statusCode === 404
          ? "NOT_FOUND"
          : "ERROR");

      return {
        success: false,
        statusCode,
        errorCode,
        message: json.message || "Unable to retrieve facility join data.",
      };
    } catch (_err) {
      return {
        success: false,
        statusCode: 500,
        errorCode: "NETWORK_ERROR",
        message: "Unable to connect to clinic portal service. Please try again or ask reception.",
      };
    }
  },
};
