import { joinApiUrl } from "@shared/safe";
import { getPortalApiUrl } from "@/utils/domain";
import { PublicQueueDisplayData } from "@/components/queue-display/types";

export interface QueueDisplayQueryParams {
  tenantSlug?: string;
  facilitySlug?: string;
  clinicId?: string;
}

export const queueDisplayService = {
  /**
   * Fetches the public queue display board data from portal-api.
   * Strips all PHI, returning only active serving tickets and upcoming tickets.
   */
  getDisplayData: async (
    params: QueueDisplayQueryParams
  ): Promise<{ success: boolean; data?: PublicQueueDisplayData; message?: string }> => {
    let endpoint = "/public/queue/display";
    if (params.tenantSlug && params.facilitySlug) {
      endpoint = `/public/queue/display/${encodeURIComponent(params.tenantSlug)}/${encodeURIComponent(params.facilitySlug)}`;
    } else {
      const searchParams = new URLSearchParams();
      if (params.tenantSlug) searchParams.set("tenantSlug", params.tenantSlug);
      if (params.facilitySlug) searchParams.set("facilitySlug", params.facilitySlug);
      if (params.clinicId) searchParams.set("clinicId", params.clinicId);
      const queryStr = searchParams.toString();
      if (queryStr) {
        endpoint = `${endpoint}?${queryStr}`;
      }
    }

    const portalApiUrl = getPortalApiUrl();
    const targetUrl = joinApiUrl(portalApiUrl, endpoint);

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && (json.succeeded || json.success || json.data)) {
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
  },
};
