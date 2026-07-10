"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { billingService } from "@/services/billing.service"
import { toast } from "sonner"
import { PricingClient } from "@/app/(main)/pricing/_components/PricingClient"

export default function BillingPage() {
  const params = useParams()
  const tenantId = params.tenant as string
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [isPortalLoading, setIsPortalLoading] = useState(false)

  const handleSubscribe = async (planId: string) => {
    // PricingClient uses "professional" but the backend expects "pro"
    const normalizedPlanId = planId === "professional" ? "pro" : planId;
    
    try {
      setIsLoading(planId)
      const { url } = await billingService.createCheckoutSession(tenantId, normalizedPlanId)
      window.location.href = url
    } catch (error) {
      toast.error("Failed to start checkout process. Please check your configuration.")
    } finally {
      setIsLoading(null)
    }
  }

  const handleOpenPortal = async () => {
    try {
      setIsPortalLoading(true)
      const { url } = await billingService.getCustomerPortalUrl(tenantId)
      window.location.href = url
    } catch (error) {
      toast.error("Billing portal is currently unavailable.")
    } finally {
      setIsPortalLoading(false)
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-end p-8 pb-0">
        <Button onClick={handleOpenPortal} disabled={isPortalLoading} variant="outline" className="shadow-sm">
          {isPortalLoading ? "Loading..." : "Manage Billing (Portal)"}
        </Button>
      </div>
      
      {/* We reuse the marketing PricingClient component but pass our subscription handlers */}
      <div className="-mt-16">
        <PricingClient onAction={handleSubscribe} loadingTier={isLoading} />
      </div>
    </div>
  )
}
