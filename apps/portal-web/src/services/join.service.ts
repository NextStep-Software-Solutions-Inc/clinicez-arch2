import { joinApiUrl } from "@shared/safe";

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
}

export const joinService = {
  /**
   * Directly validates a clinic join code against clinic-api without exposing
   * tenant or branch enumeration endpoints. Resolves the authorized tenant and facility.
   */
  validateJoinCode: async (code: string): Promise<JoinCodeValidationResult> => {
    if (!code || !code.trim()) {
      return { success: false, message: "Join code is required." };
    }

    const cleanCode = code.trim().toUpperCase();
    const clinicApiUrl = (
      process.env.NEXT_PUBLIC_CLINIC_API_URL ||
      process.env.CLINIC_API_URL ||
      "http://localhost:5245"
    ).replace(/\/+$/, "");

    const targetUrl = joinApiUrl(
      clinicApiUrl,
      `/public/join/validate/${encodeURIComponent(cleanCode)}`
    );

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && (json.success || json.data?.isValid)) {
        const d = json.data || json;
        return {
          success: true,
          tenantSlug: d.tenantSlug,
          tenantName: d.tenantName,
          facilitySlug: d.facilitySlug,
          facilityName: d.facilityName,
          facilityAddress: d.facilityAddress,
          operatingHours: d.operatingHours,
          expiresAt: d.expiresAt,
        };
      }

      return {
        success: false,
        message: json.message || "Invalid or expired clinic join code.",
      };
    } catch (_err) {
      return {
        success: false,
        message: "Unable to verify join code with clinic service. Please try again or ask reception.",
      };
    }
  },
};
