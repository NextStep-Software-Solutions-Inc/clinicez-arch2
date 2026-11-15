import { apiClient } from "@/transport/apiClient";

export interface TeleconsultBillingDto {
  tenantId: string;
  tenantSlug: string;
  isEnabled: boolean;
  billingMode: "Prepaid" | "Postpaid" | string;
  ratePerMinutePhp: number;
  allocatedBudgetPhp: number;
  prepaidBalancePhp: number;
  allowOverageBeyondAllocation: boolean;
  currentPeriodYearMonth: string;
  currentPeriodMinutesUsed: number;
  currentPeriodBilledPhp: number;
  currentPeriodOveragePhp: number;
  estimatedAvailableMinutes: number;
  hasCardOnFile?: boolean;
  isOnlinePaymentSupported?: boolean;
}

export interface UpdateTeleconsultBillingRequest {
  isEnabled: boolean;
  billingMode: "Prepaid" | "Postpaid" | string;
  allocatedBudgetPhp: number;
  prepaidTopUpPhp?: number;
  allowOverageBeyondAllocation?: boolean;
}

export const teleconsultBillingService = {
  getTeleconsultBilling: async (tenantSlug: string): Promise<TeleconsultBillingDto> => {
    const res = await apiClient.get<TeleconsultBillingDto>(
      `/tenants/${encodeURIComponent(tenantSlug)}/teleconsult-billing`
    );
    return res.data;
  },

  updateTeleconsultBilling: async (
    tenantSlug: string,
    request: UpdateTeleconsultBillingRequest
  ): Promise<TeleconsultBillingDto> => {
    const res = await apiClient.put<TeleconsultBillingDto>(
      `/tenants/${encodeURIComponent(tenantSlug)}/teleconsult-billing`,
      request
    );
    return res.data;
  },

  createTopUpCheckout: async (
    tenantSlug: string,
    amountPhp: number
  ): Promise<{ url: string }> => {
    const res = await apiClient.post<{ url: string }>(
      `/tenants/${encodeURIComponent(tenantSlug)}/teleconsult-billing/topup-checkout`,
      { amountPhp }
    );
    return res.data;
  },
};
