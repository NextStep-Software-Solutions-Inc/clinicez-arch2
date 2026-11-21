import useSWR from "swr";
import { billingService, BillingPublicConfig } from "@/services/billing.service";

export type { BillingPublicConfig };

export function usePublicConfig(fallbackData?: BillingPublicConfig | null) {
  const { data, error, isLoading, mutate } = useSWR<BillingPublicConfig>(
    "/billing/public-config",
    () => billingService.getPublicConfig(),
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 2000,
      fallbackData: fallbackData || undefined,
    }
  );

  return {
    publicConfig: data,
    trialDays: data?.trialDays,
    defaultBillingCadence: data?.defaultBillingCadence,
    isLoading: !data && isLoading,
    isError: error,
    error,
    mutate,
  };
}
