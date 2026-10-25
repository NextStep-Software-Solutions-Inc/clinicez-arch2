import useSWR from "swr"
import { billingService, BillingPlan, BillingInfo, BillingPaymentConfig } from "@/services/billing.service"

export function usePlans() {
  const { data, error, isLoading, mutate } = useSWR<BillingPlan[]>(
    "/billing/plans", 
    () => billingService.getPlans(),
    { suspense: typeof window !== "undefined" }
  )
  return {
    plans: data || [],
    isLoading,
    isError: error,
    mutate
  }
}

export function usePaymentConfig() {
  const { data, error, isLoading, mutate } = useSWR<BillingPaymentConfig>(
    "/billing/payment-config",
    () => billingService.getPaymentConfig(),
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  )
  return {
    paymentConfig: data,
    isLoading,
    isError: error,
    mutate
  }
}

export function useBillingInfo(tenantId: string) {
  const { data, error, isLoading, mutate } = useSWR<BillingInfo>(
    tenantId ? `/billing/info/${tenantId}` : null,
    () => billingService.getBillingInfo(tenantId),
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      suspense: typeof window !== "undefined"
    }
  )
  return {
    billingInfo: data,
    isLoading,
    isError: error,
    mutate
  }
}

export { usePublicConfig } from "./usePublicConfig"

