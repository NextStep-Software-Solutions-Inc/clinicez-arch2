import useSWR from "swr";
import {
  billingService,
  type BillingPlan,
  type BillingPublicConfig,
} from "@/services/billing.service";

export type { BillingPlan, BillingPublicConfig };

export function usePlans(fallbackData?: BillingPlan[]) {
  const { data, error, isLoading, mutate } = useSWR<BillingPlan[]>(
    "/billing/plans",
    () => billingService.getPlans(),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      fallbackData: fallbackData && fallbackData.length > 0 ? fallbackData : undefined,
    }
  );
  return {
    plans: data || fallbackData || [],
    isLoading: (!data || data.length === 0) && isLoading,
    isError: error,
    mutate,
  };
}

export function usePublicConfig(fallbackData?: BillingPublicConfig | null) {
  const { data, error, isLoading, mutate } = useSWR<BillingPublicConfig>(
    "/billing/public-config",
    () => billingService.getPublicConfig(),
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      shouldRetryOnError: false,
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
