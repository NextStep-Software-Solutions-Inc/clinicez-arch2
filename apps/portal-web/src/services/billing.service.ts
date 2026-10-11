import { apiClient } from "@/transport/apiClient"

export interface BillingPlan {
  id: string
  name: string
  description: string
  priceMonthly: string | number
  priceAnnually: string | number
  features: string[]
  highlighted: boolean
  requiresCheckout: boolean
  /** Ordering of the plan ladder; a higher rank is a higher tier. */
  rank: number
  /** Limit key (`limit.*`) to ceiling; a negative value means unlimited. */
  limits: Record<string, number>
  /** Keys (`feature.*`) of the features the plan includes. */
  enabledFeatures: string[]
}

export interface PaymentReceipt {
  receiptNumber: string
  amountPaid: number
  currency: string
  paidAt: string
  expiryDate: string
  paymentMethod: string
}

export interface BillingInvoice {
  invoiceNumber: string
  amount: number
  currency: string
  status: "Pending" | "Paid" | "Failed"
  planSlug: string
  isAnnual: boolean
  createdAt: string
  xenditInvoiceId: string
  receipt?: PaymentReceipt
}

export interface BillingPlanLimits {
  planTitle: string
  maxClinics: number
  maxStaff: number
  maxPatients: number
  monthlyApiQuotaLimit: number
}

export interface TenantUsage {
  facilitiesCount: number
  staffAccountsCount: number
  activePatientRecordsCount: number
  monthlyApiQuotaUsed: number
}

export interface BillingInfo {
  subscriptionStatus: string
  subscriptionPlanId: string
  invoices: BillingInvoice[]
  name: string
  clinicName?: string
  tradingName?: string
  businessType?: string
  phoneNumber?: string
  country?: string
  streetLine1?: string
  streetLine2?: string
  city?: string
  province?: string
  postalCode?: string
  taxId?: string
  isAnnual: boolean
  subscriptionExpiresAt?: string
  planLimits?: BillingPlanLimits
  usage?: TenantUsage
}

export interface CheckoutSessionRequest {
  tenantId: string
  planId?: string
  isAnnual?: boolean
  phoneNumber?: string
  country?: string
  streetLine1?: string
  streetLine2?: string
  city?: string
  province?: string
  postalCode?: string
  tradingName?: string
  businessType?: string
  taxId?: string
}

export const billingService = {
  createCheckoutSession: async (request: CheckoutSessionRequest) => {
    const res = await apiClient.post<{ url: string }>("/billing/checkout-session", request)
    return res.data
  },
  updateBillingInfo: async (request: CheckoutSessionRequest) => {
    const res = await apiClient.post<boolean>("/billing/update-info", request)
    return res.data
  },
  getCustomerPortalUrl: async (tenantId: string) => {
    const res = await apiClient.get<{ url: string }>(`/billing/customer-portal/${tenantId}`)
    return res.data
  },
  getPlans: async (): Promise<BillingPlan[]> => {
    const res = await apiClient.get<BillingPlan[]>("/billing/plans")
    return res.data
  },
  getBillingInfo: async (tenantId: string): Promise<BillingInfo> => {
    const res = await apiClient.get<BillingInfo>(`/billing/info/${tenantId}`)
    const data = res.data
    return {
      ...data,
      name: data.name || data.clinicName || "",
      clinicName: data.name || data.clinicName || "",
    }
  },
  cancelSubscription: async (tenantId: string): Promise<boolean> => {
    const res = await apiClient.post<boolean>(`/billing/cancel-subscription/${tenantId}`)
    return res.data
  }
}
