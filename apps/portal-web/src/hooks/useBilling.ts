import useSWR from "swr"
import { billingService, BillingPlan, BillingInfo } from "@/services/billing.service"

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
