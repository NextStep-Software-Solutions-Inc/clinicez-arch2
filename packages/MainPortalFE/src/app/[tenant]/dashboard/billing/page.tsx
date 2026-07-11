import BillingDashboardClient from "./BillingDashboardClient"

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
