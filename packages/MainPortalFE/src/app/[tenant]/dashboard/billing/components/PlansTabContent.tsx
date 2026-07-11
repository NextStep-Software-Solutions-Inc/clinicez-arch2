"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { 
  CheckCircle2, 
  Calendar, 
  ShieldCheck, 
  Clock,
  AlertTriangle,
  Info
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { useBillingInfo, usePlans } from "@/hooks/useBilling"
import { billingService } from "@/services/billing.service"
import PricingPlansSection from "./PricingPlansSection"
import CancelPlanDialog from "./CancelPlanDialog"

const billingSchema = z.object({
  phoneNumber: z.string().min(11, "Phone number must be at least 11 digits"),
  country: z.string().min(2, "Country is required"),
  streetLine1: z.string().trim().min(1, "Street Address is required"),
  streetLine2: z.string().optional(),
  city: z.string().trim().min(1, "City is required"),
  province: z.string().trim().min(1, "Province is required"),
  postalCode: z.string().trim().min(1, "Postal code is required"),
  tradingName: z.string().optional(),
  businessType: z.string().optional(),
  taxId: z.string().trim().min(1, "TIN / Tax ID is required")
})

interface PlansTabContentProps {
  tenantId: string
}

export default function PlansTabContent({ tenantId }: PlansTabContentProps) {
  const { billingInfo, mutate } = useBillingInfo(tenantId)
  const { plans: tiers } = usePlans()

  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [isCancelLoading, setIsCancelLoading] = useState(false)
  const [isAnnual, setIsAnnual] = useState(true)

  // Dialog and Form states
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [pendingIsAnnual, setPendingIsAnnual] = useState(true)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    phoneNumber: billingInfo?.phoneNumber || "",
    country: billingInfo?.country || "PH",
    streetLine1: billingInfo?.streetLine1 || "",
    streetLine2: billingInfo?.streetLine2 || "",
    city: billingInfo?.city || "",
    province: billingInfo?.province || "",
    postalCode: billingInfo?.postalCode || "",
    tradingName: billingInfo?.tradingName || "",
    businessType: billingInfo?.businessType || "SOLE_PROPRIETOR",
    taxId: billingInfo?.taxId || ""
  })

  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (billingInfo) {
      setFormData({
        phoneNumber: billingInfo.phoneNumber || "",
        country: billingInfo.country || "PH",
        streetLine1: billingInfo.streetLine1 || "",
        streetLine2: billingInfo.streetLine2 || "",
        city: billingInfo.city || "",
        province: billingInfo.province || "",
        postalCode: billingInfo.postalCode || "",
        tradingName: billingInfo.tradingName || "",
        businessType: billingInfo.businessType || "SOLE_PROPRIETOR",
        taxId: billingInfo.taxId || ""
      })
      setTouchedFields({})
    }
  }, [billingInfo])
  const validation = billingSchema.safeParse(formData)
  const isValid = validation.success
  const errors = !validation.success ? validation.error.flatten().fieldErrors : {}

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
        phoneNumber: formData.phoneNumber || undefined,
        country: formData.country || undefined,
        streetLine1: formData.streetLine1 || undefined,
        streetLine2: formData.streetLine2 || undefined,
        city: formData.city || undefined,
        province: formData.province || undefined,
        postalCode: formData.postalCode || undefined,
        tradingName: formData.tradingName || undefined,
        businessType: formData.businessType || undefined,
        taxId: formData.taxId || undefined,
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

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlanId) return
    const normalizedPlanId = selectedPlanId === "professional" ? "pro" : selectedPlanId

    try {
      setIsLoading(selectedPlanId)
      setShowDetailsDialog(false)
      const { url } = await billingService.createCheckoutSession({
        tenantId,
        planId: normalizedPlanId,
        isAnnual: isAnnual,
        phoneNumber: formData.phoneNumber || undefined,
        country: formData.country || undefined,
        streetLine1: formData.streetLine1 || undefined,
        streetLine2: formData.streetLine2 || undefined,
        city: formData.city || undefined,
        province: formData.province || undefined,
        postalCode: formData.postalCode || undefined,
        tradingName: formData.tradingName || undefined,
        businessType: formData.businessType || undefined,
        taxId: formData.taxId || undefined,
      })
      window.location.href = url
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start checkout process. Please check your configuration."
      toast.error(message)
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

  return (
    <div className="space-y-8">
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
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-3xl h-[85vh] max-h-[700px] flex flex-col rounded-3xl p-0 border border-primary/20 bg-background shadow-2xl overflow-hidden">
          <div className="p-6 pb-4 border-b shrink-0 relative bg-background pr-12">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold tracking-tight">Billing & Organization Setup</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm mt-1">
                Please enter your business registration and billing contact details below. This registers your organization for auto-debit billing.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleSubscribe} className="flex-1 flex flex-col min-h-0">
            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40">
              {/* Business Profile Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b pb-1.5">Business Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="tradingName" className="text-xs font-semibold text-foreground/80">Trading / Brand Name</Label>
                    <Input
                      id="tradingName"
                      value={formData.tradingName}
                      onChange={(e) => setFormData({ ...formData, tradingName: e.target.value })}
                      placeholder="e.g. ClinicEZ Manila Branch"
                      className="rounded-lg"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">If provided, this brand name will reflect on your invoices and receipts. Otherwise, the clinic name is used.</p>
                  </div>
                  
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="businessType" className="text-xs font-semibold text-foreground/80">Business Entity Type</Label>
                    <Select
                      value={formData.businessType}
                      onValueChange={(val) => setFormData({ ...formData, businessType: val })}
                    >
                      <SelectTrigger className="rounded-lg">
                        <SelectValue placeholder="Select business type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SOLE_PROPRIETOR">Sole Proprietor</SelectItem>
                        <SelectItem value="PARTNERSHIP">Partnership</SelectItem>
                        <SelectItem value="CORPORATION">Corporation</SelectItem>
                        <SelectItem value="GOVT">Government / Public Entity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="taxId" className="text-xs font-semibold text-foreground/80">
                      Tax ID / TIN <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="taxId"
                      required
                      value={formData.taxId}
                      onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                      onBlur={() => setTouchedFields(prev => ({ ...prev, taxId: true }))}
                      placeholder="e.g. 123-456-789-000"
                      className={cn(
                        "rounded-lg",
                        touchedFields.taxId && errors.taxId && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    {touchedFields.taxId && errors.taxId && (
                      <p className="text-[10px] text-destructive">{errors.taxId[0]}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Details Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b pb-1.5">Billing Contact</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="phoneNumber" className="text-xs font-semibold text-foreground/80">
                    Mobile Phone Number (E.164) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    required
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    onBlur={() => setTouchedFields(prev => ({ ...prev, phoneNumber: true }))}
                    placeholder="e.g. +639123456789"
                    className={cn(
                      "rounded-lg",
                      touchedFields.phoneNumber && errors.phoneNumber && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  {touchedFields.phoneNumber && errors.phoneNumber && (
                    <p className="text-[10px] text-destructive">{errors.phoneNumber[0]}</p>
                  )}
                </div>
              </div>

              {/* Physical Address Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b pb-1.5">Billing Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="country" className="text-xs font-semibold text-foreground/80">
                      Country <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.country}
                      onValueChange={(val) => {
                        setFormData({ ...formData, country: val })
                        setTouchedFields(prev => ({ ...prev, country: true }))
                      }}
                    >
                      <SelectTrigger className={cn(
                        "rounded-lg",
                        touchedFields.country && errors.country && "border-destructive focus-visible:ring-destructive"
                      )}>
                        <SelectValue placeholder="Select Country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PH">Philippines (PHP)</SelectItem>
                        <SelectItem value="ID">Indonesia (IDR)</SelectItem>
                        <SelectItem value="SG">Singapore (SGD)</SelectItem>
                      </SelectContent>
                    </Select>
                    {touchedFields.country && errors.country && (
                      <p className="text-[10px] text-destructive">{errors.country[0]}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="streetLine1" className="text-xs font-semibold text-foreground/80">
                      Street Address Line 1 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="streetLine1"
                      required
                      value={formData.streetLine1}
                      onChange={(e) => setFormData({ ...formData, streetLine1: e.target.value })}
                      onBlur={() => setTouchedFields(prev => ({ ...prev, streetLine1: true }))}
                      placeholder="e.g. 123 Health Ave, Suite 4B"
                      className={cn(
                        "rounded-lg",
                        touchedFields.streetLine1 && errors.streetLine1 && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    {touchedFields.streetLine1 && errors.streetLine1 && (
                      <p className="text-[10px] text-destructive">{errors.streetLine1[0]}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="streetLine2" className="text-xs font-semibold text-foreground/80">Street Address Line 2 (Optional)</Label>
                    <Input
                      id="streetLine2"
                      value={formData.streetLine2}
                      onChange={(e) => setFormData({ ...formData, streetLine2: e.target.value })}
                      placeholder="e.g. Village/Subdivision"
                      className="rounded-lg"
                    />
                  </div>

                  <div className="space-y-1.5 col-span-1">
                    <Label htmlFor="city" className="text-xs font-semibold text-foreground/80">
                      City / Municipality <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="city"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      onBlur={() => setTouchedFields(prev => ({ ...prev, city: true }))}
                      placeholder="e.g. Pasig"
                      className={cn(
                        "rounded-lg",
                        touchedFields.city && errors.city && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    {touchedFields.city && errors.city && (
                      <p className="text-[10px] text-destructive">{errors.city[0]}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 col-span-1">
                    <Label htmlFor="province" className="text-xs font-semibold text-foreground/80">
                      Province / State <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="province"
                      required
                      value={formData.province}
                      onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                      onBlur={() => setTouchedFields(prev => ({ ...prev, province: true }))}
                      placeholder="e.g. Metro Manila"
                      className={cn(
                        "rounded-lg",
                        touchedFields.province && errors.province && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    {touchedFields.province && errors.province && (
                      <p className="text-[10px] text-destructive">{errors.province[0]}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 col-span-1">
                    <Label htmlFor="postalCode" className="text-xs font-semibold text-foreground/80">
                      Postal / Zip Code <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="postalCode"
                      required
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      onBlur={() => setTouchedFields(prev => ({ ...prev, postalCode: true }))}
                      placeholder="e.g. 1600"
                      className={cn(
                        "rounded-lg",
                        touchedFields.postalCode && errors.postalCode && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    {touchedFields.postalCode && errors.postalCode && (
                      <p className="text-[10px] text-destructive">{errors.postalCode[0]}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="p-6 pt-4 border-t bg-background shrink-0">
              <DialogFooter className="gap-2 md:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDetailsDialog(false)}
                  className="rounded-full px-6 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!isValid || isLoading !== null}
                  className="rounded-full px-6 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading !== null ? "Redirecting..." : "Proceed to Payment"}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Plan Switch Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl border border-primary/20 bg-background shadow-2xl p-6">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {(() => {
                const currentPlan = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" ? "professional" : "starter"
                const newPlan = pendingPlanId
                
                const isTierDowngrade = currentPlan === "professional" && newPlan === "starter"
                const isCycleDowngradeOnly = currentPlan === newPlan && isSubscribedAnnual && !pendingIsAnnual

                if (isTierDowngrade) {
                  return (
                    <>
                      <AlertTriangle className="h-5.5 w-5.5 text-amber-500" />
                      Confirm Plan Downgrade
                    </>
                  )
                }
                if (isCycleDowngradeOnly) {
                  return (
                    <>
                      <Info className="h-5.5 w-5.5 text-blue-500" />
                      Confirm Cycle Change
                    </>
                  )
                }
                return (
                  <>
                    <ShieldCheck className="h-5.5 w-5.5 text-primary" />
                    Confirm Plan Upgrade
                  </>
                )
              })()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-normal" asChild>
              {(() => {
                const currentPlan = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" ? "professional" : "starter"
                const newPlan = pendingPlanId
                
                const isTierDowngrade = currentPlan === "professional" && newPlan === "starter"
                const isCycleDowngradeOnly = currentPlan === newPlan && isSubscribedAnnual && !pendingIsAnnual

                if (isTierDowngrade) {
                  return (
                    <div className="space-y-3">
                      <p className="mt-2">
                        You are about to downgrade your subscription plan to the <span className="font-bold text-foreground capitalize">{pendingPlanId} Plan ({pendingIsAnnual ? "Annual" : "Monthly"})</span>.
                      </p>
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-900 dark:text-amber-100 flex gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Downgrading your plan tier may reduce your limits, templates capacity, or laboratory integration connections. Changes will take effect on the next cycle.
                        </span>
                      </div>
                    </div>
                  )
                }
                if (isCycleDowngradeOnly) {
                  return (
                    <div className="space-y-3">
                      <p className="mt-2">
                        You are about to switch your billing cycle to the <span className="font-bold text-foreground capitalize">{pendingPlanId} Plan (Monthly)</span>.
                      </p>
                      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-900 dark:text-blue-200 flex gap-2">
                        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <span>
                          Note: Switching from an annual plan to a monthly plan removes the 20% savings discount. Your clinic limits, templates, and laboratory integrations will remain fully unchanged.
                        </span>
                      </div>
                    </div>
                  )
                }
                return (
                  <div className="space-y-3">
                    <p className="mt-2">
                      You are about to upgrade your subscription plan to the <span className="font-bold text-foreground capitalize">{pendingPlanId} Plan ({pendingIsAnnual ? "Annual" : "Monthly"})</span>.
                    </p>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-950 dark:text-emerald-300 flex gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        Upgrading will immediately unlock premium templates, laboratory integration connections, and higher storage thresholds for your clinic.
                      </span>
                    </div>
                  </div>
                )
              })()}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowConfirmDialog(false)
                setPendingPlanId(null)
              }}
              className="rounded-full px-5 text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSwitch}
              disabled={isLoading !== null}
              className="rounded-full px-5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading !== null ? "Redirecting..." : "Confirm & Proceed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
