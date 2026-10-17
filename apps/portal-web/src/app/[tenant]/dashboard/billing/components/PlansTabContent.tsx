"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { 
  CheckCircle2, 
  Calendar, 
  ShieldCheck, 
  Clock,
  AlertTriangle
} from "lucide-react"
import { toast } from "sonner"
import { useBillingInfo, usePlans } from "@/hooks/useBilling"
import { billingService } from "@/services/billing.service"
import PricingPlansSection from "./PricingPlansSection"
import CancelPlanDialog from "./CancelPlanDialog"
import BillingSetupDialog from "./BillingSetupDialog"
import ConfirmPlanSwitchDialog from "./ConfirmPlanSwitchDialog"
import { PlansTabSkeleton } from "./BillingSkeletons"

interface PlansTabContentProps {
  tenantId: string
}

export default function PlansTabContent({ tenantId }: PlansTabContentProps) {
  const { billingInfo, mutate, isLoading: isBillingLoading } = useBillingInfo(tenantId)
  const { plans: tiers, isLoading: isPlansLoading } = usePlans()

  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [isCancelLoading, setIsCancelLoading] = useState(false)
  const [isAnnual, setIsAnnual] = useState(false)

  // Dialog states
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [pendingIsAnnual, setPendingIsAnnual] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const isSubscribed = 
    billingInfo?.subscriptionStatus === "ACTIVE" || 
    (billingInfo?.subscriptionStatus === "CANCELLED" && 
     !!billingInfo.subscriptionExpiresAt && 
     new Date(billingInfo.subscriptionExpiresAt) > new Date())
  const isCancelled = billingInfo?.subscriptionStatus === "CANCELLED"
  const isSubscribedAnnual = billingInfo?.isAnnual ?? false
  const activePlanName = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" ? "Professional Plan" : "Starter Plan"
  const activePlanPrice = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" 
    ? (isSubscribedAnnual ? "₱5,940" : "₱7,740") 
    : (isSubscribedAnnual ? "₱2,340" : "₱2,940")

  const handlePlanClick = (tierId: string) => {
    const normalizedPlanId = tierId === "professional" ? "pro" : tierId
    const isDifferentPlan = 
      billingInfo?.subscriptionPlanId?.toLowerCase() !== normalizedPlanId || 
      isSubscribedAnnual !== isAnnual

    if (isSubscribed && isDifferentPlan) {
      setPendingPlanId(tierId)
      setPendingIsAnnual(isAnnual)
      setShowConfirmDialog(true)
    } else {
      setSelectedPlanId(tierId)
      setShowDetailsDialog(true)
    }
  }

  const handleConfirmSwitch = async () => {
    if (!pendingPlanId) return
    const normalizedPlanId = pendingPlanId === "professional" ? "pro" : pendingPlanId

    try {
      setIsLoading(pendingPlanId)
      setShowConfirmDialog(false)
      const { url } = await billingService.createCheckoutSession({
        tenantId,
        planId: normalizedPlanId,
        isAnnual: pendingIsAnnual,
        phoneNumber: billingInfo?.phoneNumber || undefined,
        country: billingInfo?.country || undefined,
        streetLine1: billingInfo?.streetLine1 || undefined,
        streetLine2: billingInfo?.streetLine2 || undefined,
        city: billingInfo?.city || undefined,
        province: billingInfo?.province || undefined,
        postalCode: billingInfo?.postalCode || undefined,
        tradingName: billingInfo?.tradingName || undefined,
        businessType: billingInfo?.businessType || undefined,
        taxId: billingInfo?.taxId || undefined,
      })
      window.location.href = url
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch plan."
      toast.error(message)
    } finally {
      setIsLoading(null)
      setPendingPlanId(null)
    }
  }

  const handleOpenPortal = async () => {
    try {
      setIsPortalLoading(true)
      const { url } = await billingService.getCustomerPortalUrl(tenantId)
      window.location.href = url
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing portal is currently unavailable."
      toast.error(message)
    } finally {
      setIsPortalLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    try {
      setIsCancelLoading(true)
      await billingService.cancelSubscription(tenantId)
      toast.success("Subscription cancelled successfully.")
      setShowCancelDialog(false)
      mutate()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel subscription."
      toast.error(message)
    } finally {
      setIsCancelLoading(false)
    }
  }

  const isInitialLoading = (isBillingLoading || isPlansLoading) && (!billingInfo || tiers.length === 0)

  if (isInitialLoading) {
    return <PlansTabSkeleton />
  }

  return (
    <div id="billing-plans-section" className="space-y-8 animate-in fade-in-50 duration-300">
      {isSubscribed ? (
        <div className="flex flex-col gap-6">
          {/* Active Plan Overview */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 p-8 shadow-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
              
              {isCancelled ? (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-semibold text-sm uppercase tracking-wider mb-4">
                  <Clock className="h-5 w-5 animate-pulse" />
                  Subscription Cancelled (Grace Period)
                </div>
              ) : (
                <div className="flex items-center gap-2 text-primary font-semibold text-sm uppercase tracking-wider mb-4">
                  <ShieldCheck className="h-5 w-5" />
                  Active Subscription
                </div>
              )}

              <h3 className="text-2xl font-bold mb-1">{activePlanName} {isSubscribedAnnual && "(Annual)"}</h3>
              <p className="text-muted-foreground text-sm mb-6">
                {isCancelled 
                  ? "This plan is scheduled for deactivation and will not be charged again."
                  : `Governed by fully-automated recurring ${isSubscribedAnnual ? "annual" : "monthly"} charges.`
                }
              </p>
              
              <div className="flex items-baseline text-4xl font-extrabold mb-1">
                {activePlanPrice}
                <span className="ml-1 text-sm font-medium text-muted-foreground">/ month</span>
              </div>
              <p className="text-xs text-muted-foreground mb-6">
                {isSubscribedAnnual 
                  ? `Billed annually at ₱${billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" ? "71,280" : "28,080"} / year` 
                  : "Billed monthly"}
              </p>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground pt-4 border-t border-border/60">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-foreground/80" />
                  {isCancelled 
                    ? "Does not auto-renew (Cancelled)" 
                    : `Auto-renews ${isSubscribedAnnual ? "annually" : "monthly"}`
                  }
                </div>
                {billingInfo?.subscriptionExpiresAt && (
                  <div className="flex items-center gap-1.5">
                    <Clock className={`h-4 w-4 ${isCancelled ? "text-amber-600 dark:text-amber-500" : "text-emerald-600"}`} />
                    {isCancelled ? "Access expires on: " : "Expires/renews on: "} {new Date(billingInfo.subscriptionExpiresAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric"
                    })}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className={`h-4 w-4 ${isCancelled ? "text-muted-foreground" : "text-emerald-600"}`} />
                  {isCancelled ? "Deactivation Pending" : "Payment Link Associated"}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-8 flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="font-bold text-lg mb-2">Manage Subscription</h4>
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                  Upgrade, downgrade, or suspend your active billing cycle securely. You can modify billing and account configurations via our payment portal.
                </p>
              </div>
              <div className="space-y-3">
                <Button 
                  onClick={handleOpenPortal}
                  disabled={isPortalLoading}
                  className="w-full rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                >
                  {isPortalLoading ? "Loading..." : "Manage Billing Portal"}
                </Button>

                {isSubscribed && !isCancelled && (
                  <Button
                    variant="outline"
                    onClick={() => setShowCancelDialog(true)}
                    className="w-full rounded-full text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors shadow-none"
                  >
                    Cancel Subscription
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 items-start rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-amber-900 dark:text-amber-100 shadow-sm">
          <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-lg leading-snug">No Active Plan Subscription</h4>
            <p className="text-sm opacity-90 mt-1 leading-relaxed">
              Your clinic is currently in setup mode. Please select and subscribe to one of the payment plans below to enable laboratory connections, advanced templates, and unbounded patient files.
            </p>
          </div>
        </div>
      )}

      <PricingPlansSection
        tiers={tiers}
        isAnnual={isAnnual}
        setIsAnnual={setIsAnnual}
        isSubscribed={isSubscribed}
        isSubscribedAnnual={isSubscribedAnnual}
        billingInfo={billingInfo || null}
        isLoading={isLoading}
        handlePlanClick={handlePlanClick}
      />

      {/* Organization Setup & Billing Details Dialog */}
      <BillingSetupDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        tenantId={tenantId}
        selectedPlanId={selectedPlanId}
        isAnnual={isAnnual}
        billingInfo={billingInfo || null}
      />

      {/* Plan Switch Confirmation Dialog */}
      <ConfirmPlanSwitchDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        billingInfo={billingInfo || null}
        isSubscribedAnnual={isSubscribedAnnual}
        pendingPlanId={pendingPlanId}
        pendingIsAnnual={pendingIsAnnual}
        isLoading={isLoading !== null}
        onConfirm={handleConfirmSwitch}
        onCancel={() => {
          setShowConfirmDialog(false)
          setPendingPlanId(null)
        }}
      />

      {/* Plan Cancellation Confirmation Dialog */}
      <CancelPlanDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        expiryDate={billingInfo?.subscriptionExpiresAt}
        onConfirm={handleCancelSubscription}
        isLoading={isCancelLoading}
      />
    </div>
  )
}
