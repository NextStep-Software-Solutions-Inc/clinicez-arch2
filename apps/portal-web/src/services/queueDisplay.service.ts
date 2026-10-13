import { joinApiUrl } from "@shared/safe";
import { PublicQueueDisplayData } from "@/components/queue-display/types";

export interface QueueDisplayQueryParams {
  tenantSlug?: string;
  facilitySlug?: string;
  clinicId?: string;
}

export const queueDisplayService = {
  /**
   * Fetches the public queue display board data from clinic-api.
   * Strips all PHI, returning only active serving tickets and upcoming tickets.
   */
  getDisplayData: async (
    params: QueueDisplayQueryParams
  ): Promise<{ success: boolean; data?: PublicQueueDisplayData; message?: string }> => {
    const searchParams = new URLSearchParams();
    if (params.tenantSlug) searchParams.set("tenantSlug", params.tenantSlug);
    if (params.facilitySlug) searchParams.set("facilitySlug", params.facilitySlug);
    if (params.clinicId) searchParams.set("clinicId", params.clinicId);

    const queryStr = searchParams.toString();
    const endpoint = `/public/queue/display${queryStr ? `?${queryStr}` : ""}`;

    // On client-side in browser:
    if (typeof window !== "undefined") {
      try {
        const res = await fetch(`/api/v1${endpoint}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const json = await res.json().catch(() => ({}));
        if (res.ok && (json.success || json.data)) {
          return { success: true, data: json.data || json };
        }
        return {
          success: false,
          message: json.message || "Failed to load queue display data.",
        };
      } catch (err: any) {
        return {
          success: false,
          message: err.message || "Network error loading queue display.",
        };
      }
    }

    // On server-side (Node.js SSR):
    const clinicApiUrl = (
      process.env.NEXT_PUBLIC_CLINIC_API_URL ||
      process.env.CLINIC_API_URL ||
      "http://localhost:5245"
    ).replace(/\/+$/, "");

    const targetUrl = joinApiUrl(clinicApiUrl, endpoint);

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && (json.success || json.data)) {
        return { success: true, data: json.data || json };
      }
      return {
        success: false,
        message: json.message || "Failed to load queue display data from clinic API.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Failed to connect to clinic service.",
      };
    }
  },
};
