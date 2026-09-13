import { Metadata } from "next"
import BillingDashboardClient from "./BillingDashboardClient"

export const metadata: Metadata = {
  title: "Billing & Subscriptions | Clinic EZ Dashboard",
  description: "Manage your subscription plans, view payment history, update organization details, and handle invoices.",
  keywords: ["billing", "clinic billing", "subscription plan", "payment method", "invoices"],
}

interface PageProps {
  params: Promise<{ tenant: string }>
}

export default async function BillingPage({ params }: PageProps) {
  const resolvedParams = await params
  const tenantId = resolvedParams.tenant

  return (
    <div className="w-full">
      <BillingDashboardClient tenantId={tenantId} />
    </div>
  )
}
