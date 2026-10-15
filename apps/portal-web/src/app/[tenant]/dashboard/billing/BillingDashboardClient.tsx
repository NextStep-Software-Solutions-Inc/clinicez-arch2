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
import OfflinePaymentInstructionsCard from "./components/OfflinePaymentInstructionsCard"

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
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Billing & Subscriptions</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Manage your clinic plan details, payment settings, and download receipts.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-6">
        <div className="w-full overflow-x-auto pb-1.5 no-scrollbar -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 justify-start h-auto p-1 bg-muted/65 rounded-xl border flex-nowrap gap-1">
            <TabsTrigger value="plans" className="px-4 sm:px-6 py-2 text-xs font-semibold shrink-0 whitespace-nowrap">Plans & Subscription</TabsTrigger>
            <TabsTrigger value="billing" className="px-4 sm:px-6 py-2 text-xs font-semibold shrink-0 whitespace-nowrap">Billing History</TabsTrigger>
            <TabsTrigger value="organization" className="px-4 sm:px-6 py-2 text-xs font-semibold shrink-0 whitespace-nowrap">Organization Details</TabsTrigger>
            <TabsTrigger value="payment" className="px-4 sm:px-6 py-2 text-xs font-semibold shrink-0 whitespace-nowrap">Payment Method</TabsTrigger>
            <TabsTrigger value="offline" className="px-4 sm:px-6 py-2 text-xs font-semibold shrink-0 whitespace-nowrap">Bank Transfer & Offline</TabsTrigger>
          </TabsList>
        </div>

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

        {/* 5. OFFLINE BANK TRANSFER INSTRUCTIONS TAB CONTENT */}
        <TabsContent value="offline" className="outline-none space-y-6">
          <OfflinePaymentInstructionsCard tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
