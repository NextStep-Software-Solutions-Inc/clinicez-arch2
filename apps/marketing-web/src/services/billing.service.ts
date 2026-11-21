import { apiClient } from "@/transport/apiClient";
import { getPortalApiUrl } from "@/utils/urls";

export interface BillingPlan {
  id: string;
  key?: string;
  planId?: string;
  slug?: string;
  name: string;
  description: string;
  monthlyPrice?: number;
  annualPrice?: number;
  priceMonthly: string | number;
  priceAnnually: string | number;
  features: string[];
  highlighted: boolean;
  requiresCheckout: boolean;
  /** Ordering of the plan ladder; a higher rank is a higher tier. */
  rank: number;
  /** Plan configuration version */
  version?: number;
  isArchived?: boolean;
  activeSubscribersCount?: number;
  /** Limit key (`limit.*`) to ceiling; a negative value means unlimited. */
  limits: Record<string, number>;
  /** Keys (`feature.*`) of the features the plan includes. */
  enabledFeatures: string[];
}

export interface BillingPublicConfig {
  trialDays: number;
  defaultBillingCadence?: "monthly" | "annually" | string;
}

export const billingService = {
  getPlans: async (): Promise<BillingPlan[]> => {
    const res = await apiClient.get<BillingPlan[]>("/billing/plans");
    return Array.isArray(res.data) ? res.data : [];
  },

  getPublicConfig: async (): Promise<BillingPublicConfig> => {
    const url = `${getPortalApiUrl().replace(/\/+$/, "")}/billing/public-config`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Failed to load public config: HTTP ${res.status}`);
    }
    return res.json();
  },
};
