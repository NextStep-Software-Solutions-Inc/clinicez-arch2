"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  PlansTabSkeleton,
  BillingHistorySkeleton,
  OrganizationDetailsSkeleton,
  PaymentMethodSkeleton
} from "./components/BillingSkeletons"

import PlansTabContent from "./components/PlansTabContent"
import BillingHistoryContent from "./components/BillingHistoryContent"
import OrganizationDetailsContent from "./components/OrganizationDetailsContent"
import PaymentMethodContent from "./components/PaymentMethodContent"

export default function BillingDashboardClient({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabQuery = searchParams ? searchParams.get("tab") : null

  const [activeTab, setActiveTab] = useState("plans")

  useEffect(() => {
    if (tabQuery) {
      setActiveTab(tabQuery)
    } else {
      router.replace(`${pathname}?tab=plans`)
    }
  }, [tabQuery, pathname, router])

  const handleTabChange = (val: string) => {
    setActiveTab(val)
    router.push(`${pathname}?tab=${val}`)
  }

  return (
    <div className="w-full flex-1 flex flex-col gap-8 p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Billing & Subscriptions</h1>
          <p className="text-muted-foreground mt-1">Manage your clinic plan details, payment settings, and download receipts.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-6">
        <TabsList className="grid grid-cols-2 md:inline-flex w-full md:w-auto h-auto p-1 bg-muted/65 rounded-xl border">
          <TabsTrigger value="plans" className="px-6 py-2 text-xs font-semibold">Plans & Subscription</TabsTrigger>
          <TabsTrigger value="billing" className="px-6 py-2 text-xs font-semibold">Billing History</TabsTrigger>
          <TabsTrigger value="organization" className="px-6 py-2 text-xs font-semibold">Organization Details</TabsTrigger>
          <TabsTrigger value="payment" className="px-6 py-2 text-xs font-semibold">Payment Method</TabsTrigger>
        </TabsList>

        {/* 1. PLANS TAB CONTENT */}
        <TabsContent value="plans" className="space-y-8 outline-none">
          <Suspense fallback={<PlansTabSkeleton />}>
            <PlansTabContent tenantId={tenantId} />
          </Suspense>
        </TabsContent>

        {/* 2. BILLING HISTORY TAB CONTENT */}
        <TabsContent value="billing" className="outline-none">
          <Suspense fallback={<BillingHistorySkeleton />}>
            <BillingHistoryContent tenantId={tenantId} />
          </Suspense>
        </TabsContent>

        {/* 3. ORGANIZATION DETAILS TAB CONTENT */}
        <TabsContent value="organization" className="outline-none">
          <Suspense fallback={<OrganizationDetailsSkeleton />}>
            <OrganizationDetailsContent tenantId={tenantId} />
          </Suspense>
        </TabsContent>

        {/* 4. PAYMENT METHOD TAB CONTENT */}
        <TabsContent value="payment" className="outline-none space-y-6">
          <Suspense fallback={<PaymentMethodSkeleton />}>
            <PaymentMethodContent tenantId={tenantId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}
