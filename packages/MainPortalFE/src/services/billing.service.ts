import { apiClient } from "@/transport/apiClient"

export const billingService = {
  createCheckoutSession: async (tenantId: string, planId: string) => {
    const res = await apiClient.post<{ url: string }>("/billing/checkout-session", { tenantId, planId })
    return res.data
  },
  getCustomerPortalUrl: async (tenantId: string) => {
    const res = await apiClient.get<{ url: string }>(`/billing/customer-portal/${tenantId}`)
    return res.data
  },
  getPlans: async () => {
    const res = await apiClient.get<any[]>("/billing/plans")
    return res.data
  }
}
