"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { billingService, PaymentReceipt, BillingInvoice } from "@/services/billing.service"
import { useBillingInfo, usePlans } from "@/hooks/useBilling"
import { toast } from "sonner"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { printReceipt } from "@/utils/printReceipt"
import { printInvoice } from "@/utils/printInvoice"
import { 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  ArrowRight, 
  ShieldCheck, 
  FileText, 
  CreditCard, 
  Building2, 
  Lock,
  Clock,
  Printer,
  Info
} from "lucide-react"

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

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

export default function BillingDashboardClient({ tenantId }: { tenantId: string }) {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [isCancelLoading, setIsCancelLoading] = useState(false)
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false)
  const [isAnnual, setIsAnnual] = useState(true)

  // Dialog and Form states
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [pendingIsAnnual, setPendingIsAnnual] = useState(true)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null)
  const [formData, setFormData] = useState({
    phoneNumber: "",
    country: "PH",
    streetLine1: "",
    streetLine2: "",
    city: "",
    province: "",
    postalCode: "",
    tradingName: "",
    businessType: "SOLE_PROPRIETOR",
    taxId: ""
  })

  // Real-time Zod validation
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({})
  const validation = billingSchema.safeParse(formData)
  const isValid = validation.success
  const errors = !validation.success ? validation.error.flatten().fieldErrors : {}

  const { billingInfo, isLoading: isBillingLoading, mutate } = useBillingInfo(tenantId)
  const { plans: tiers, isLoading: isLoadingPlans } = usePlans()

  // Sync database info into local form state
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

  const handleUpdateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsUpdatingInfo(true)
      await billingService.updateBillingInfo({
        tenantId,
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
      toast.success("Organization profile updated successfully.")
      mutate()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update organization profile."
      toast.error(message)
    } finally {
      setIsUpdatingInfo(false)
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

  if (isBillingLoading || isLoadingPlans) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Loading billing details...</p>
        </div>
      </div>
    )
  }

  const isSubscribed = 
    billingInfo?.subscriptionStatus === "ACTIVE" || 
    (billingInfo?.subscriptionStatus === "CANCELLED" && 
     billingInfo.subscriptionExpiresAt && 
     new Date(billingInfo.subscriptionExpiresAt) > new Date())
  const isCancelled = billingInfo?.subscriptionStatus === "CANCELLED"
  const isSubscribedAnnual = billingInfo?.isAnnual ?? false
  const activePlanName = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" ? "Professional Plan" : "Starter Plan"
  const activePlanPrice = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" 
    ? (isSubscribedAnnual ? "₱5,940" : "₱7,740") 
    : (isSubscribedAnnual ? "₱2,340" : "₱2,940")

  return (
    <div className="w-full flex-1 flex flex-col gap-8 p-8 max-w-6xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Billing & Subscriptions</h1>
          <p className="text-muted-foreground mt-1">Manage your clinic plan details, payment settings, and download receipts.</p>
        </div>
      </div>

      <Tabs defaultValue="plans" className="w-full space-y-6">
        <TabsList className="grid grid-cols-2 md:inline-flex w-full md:w-auto h-auto p-1 bg-muted/65 rounded-xl border">
          <TabsTrigger value="plans" className="px-6 py-2 text-xs font-semibold">Plans & Subscription</TabsTrigger>
          <TabsTrigger value="billing" className="px-6 py-2 text-xs font-semibold">Billing History</TabsTrigger>
          <TabsTrigger value="organization" className="px-6 py-2 text-xs font-semibold">Organization Details</TabsTrigger>
          <TabsTrigger value="payment" className="px-6 py-2 text-xs font-semibold">Payment Method</TabsTrigger>
        </TabsList>

        {/* 1. PLANS TAB CONTENT */}
        <TabsContent value="plans" className="space-y-8 outline-none">
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

          {/* Pricing Section Grid */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t pt-6">
              <div>
                <h2 className="text-xl font-bold">Select a Subscription Plan</h2>
                <p className="text-muted-foreground text-sm">Choose the best billing cycle for your practice.</p>
              </div>
              
              <div className="flex items-center gap-4 bg-muted/40 p-1.5 rounded-full border w-fit">
                <button 
                  onClick={() => setIsAnnual(false)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    !isAnnual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button 
                  onClick={() => setIsAnnual(true)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isAnnual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Annually
                  <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    Save 20%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {tiers.map((tier) => {
                const normalizedPlanId = tier.id === "professional" ? "pro" : tier.id
                const isCurrentPlan = isSubscribed && 
                  billingInfo?.subscriptionPlanId?.toLowerCase() === normalizedPlanId && 
                  isSubscribedAnnual === isAnnual

                return (
                  <div 
                    key={tier.id}
                    className={`relative flex flex-col rounded-3xl border p-8 shadow-sm transition-all ${
                      isCurrentPlan
                        ? 'border-emerald-500 bg-emerald-500/5 shadow-emerald-500/10'
                        : tier.highlighted 
                          ? 'border-primary bg-primary/5 shadow-primary/10 scale-105 z-10' 
                          : 'border-border bg-card'
                    }`}
                  >
                    {isCurrentPlan && (
                      <div className="absolute -top-3.5 left-0 right-0 mx-auto w-fit rounded-full bg-emerald-600 px-4 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Your Current Plan
                      </div>
                    )}
                    {!isCurrentPlan && tier.highlighted && (
                      <div className="absolute -top-3.5 left-0 right-0 mx-auto w-fit rounded-full bg-primary px-4 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        Most Popular
                      </div>
                    )}
                    
                    <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
                    <p className="text-muted-foreground text-xs mb-6 h-10 leading-normal">{tier.description}</p>
                    
                    <div className="mb-6">
                      {typeof tier.priceMonthly === 'number' ? (
                        <div className="flex items-baseline text-4xl font-extrabold">
                          ₱{Number(isAnnual ? tier.priceAnnually : tier.priceMonthly).toLocaleString()}
                          <span className="ml-1 text-sm font-medium text-muted-foreground">/mo</span>
                        </div>
                      ) : (
                        <div className="text-3xl font-extrabold">{tier.priceMonthly}</div>
                      )}
                    </div>

                    <ul className="space-y-3.5 mb-8 flex-grow">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start">
                          <CheckCircle2 className={`h-4.5 w-4.5 mr-3 shrink-0 mt-0.5 ${isCurrentPlan ? 'text-emerald-600' : 'text-primary'}`} />
                          <span className="text-xs">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button 
                      onClick={() => {
                        if (tier.requiresCheckout) {
                          handlePlanClick(tier.id)
                        } else if (tier.id === "enterprise") {
                          window.location.href = "mailto:sales@clinicez.net"
                        }
                      }}
                      disabled={isCurrentPlan || isLoading === tier.id || (!tier.requiresCheckout && tier.id !== "enterprise")}
                      className={`w-full rounded-full py-2.5 text-xs font-semibold transition-all ${
                        isCurrentPlan
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 cursor-not-allowed'
                          : tier.highlighted 
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      } ${isLoading === tier.id ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {isLoading === tier.id 
                        ? 'Loading...' 
                        : isCurrentPlan
                          ? 'Active Plan'
                          : tier.requiresCheckout
                            ? isSubscribed
                              ? 'Switch to this Plan'
                              : `Subscribe to ${tier.name}` 
                            : tier.id === 'enterprise' ? 'Contact Sales' : 'Get Started'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* 2. BILLING HISTORY TAB CONTENT */}
        <TabsContent value="billing" className="outline-none">
          <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-8 border-b border-border/60 bg-muted/20">
              <h3 className="text-xl font-bold">Billing History</h3>
              <p className="text-muted-foreground text-sm mt-1">A list of all recurring invoice receipts processed securely.</p>
            </div>

            {(billingInfo?.invoices?.length ?? 0) > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground font-medium bg-muted/10">
                      <th className="p-4 pl-8">Invoice Number</th>
                      <th className="p-4">Plan Name</th>
                      <th className="p-4">Billing Cycle</th>
                      <th className="p-4">Invoice Date & Time</th>
                      <th className="p-4">Coverage Period</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 pr-8 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingInfo?.invoices?.map((invoice: BillingInvoice, idx: number) => (
                      <tr 
                        key={idx} 
                        onClick={() => {
                          setSelectedInvoice(invoice)
                          setShowInvoiceDialog(true)
                        }}
                        className="border-b border-border/40 hover:bg-muted/10 transition-colors cursor-pointer"
                      >
                        <td className="p-4 pl-8 font-mono text-xs text-primary hover:underline font-semibold">{invoice.invoiceNumber}</td>
                        <td className="p-4 font-semibold capitalize">{invoice.planSlug}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                            invoice.isAnnual 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {invoice.isAnnual ? "Annual" : "Monthly"}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {new Date(invoice.createdAt).toLocaleString("en-US", { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="p-4 text-muted-foreground text-xs">
                          {new Date(invoice.createdAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                          {" - "}
                          {invoice.receipt?.expiryDate 
                            ? new Date(invoice.receipt.expiryDate).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
                            : new Date(new Date(invoice.createdAt).setMonth(new Date(invoice.createdAt).getMonth() + (invoice.isAnnual ? 12 : 1))).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
                          }
                        </td>
                        <td className="p-4 font-semibold">
                          {invoice.currency} {invoice.amount.toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            invoice.status === "Paid"
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                              : invoice.status === "Failed"
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          }`}>
                            {invoice.status}
                          </span>
                        </td>
                        <td className="p-4 pr-8 text-right flex items-center justify-end gap-4">
                          {invoice.status === "Paid" && invoice.receipt && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                printReceipt(invoice.receipt!, billingInfo || null, invoice.planSlug, invoice.isAnnual, invoice.xenditInvoiceId)
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors bg-transparent border-0 cursor-pointer p-0"
                            >
                              <Printer className="h-4 w-4" />
                              Print Receipt
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              printInvoice(invoice, billingInfo || null)
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors bg-transparent border-0 cursor-pointer p-0"
                          >
                            <Printer className="h-4 w-4" />
                            Print Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 stroke-[1.5] opacity-50" />
                <p>No billing invoices recorded yet.</p>
                <p className="text-xs mt-1">Invoices will populate here automatically upon cycle created events.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 3. ORGANIZATION DETAILS TAB CONTENT */}
        <TabsContent value="organization" className="outline-none">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Overview / Card details */}
            <div className="rounded-3xl border border-border bg-card p-8 shadow-sm h-fit space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Tenant Profile</h3>
                  <p className="text-xs text-muted-foreground">Registration metadata stored on database</p>
                </div>
              </div>

              <div className="space-y-4 text-sm border-t pt-4">
                <div>
                  <span className="block text-xs text-muted-foreground">Tenant Name</span>
                  <span className="font-semibold">{billingInfo?.clinicName || "Tenant Provider"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">Trading Name</span>
                  <span className="font-semibold">{billingInfo?.tradingName || "--"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">Entity Type</span>
                  <span className="font-semibold capitalize">{(billingInfo?.businessType || "SOLE_PROPRIETOR").replace("_", " ")}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">Billing Country</span>
                  <span className="font-semibold">{billingInfo?.country || "--"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">Tax ID / TIN</span>
                  <span className="font-semibold">{billingInfo?.taxId || "--"}</span>
                </div>
              </div>
            </div>

            {/* Editable Form Profile Details */}
            <div className="md:col-span-2 rounded-3xl border border-border bg-card p-8 shadow-sm">
              <h3 className="text-xl font-bold mb-1">Update Organization Details</h3>
              <p className="text-muted-foreground text-sm mb-6">Manage brand identifiers and legal addresses associated with your billing files.</p>

              <form onSubmit={handleUpdateOrganization} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="orgTradingName" className="text-xs font-semibold text-foreground/80">Trading / Brand Name</Label>
                    <Input
                      id="orgTradingName"
                      value={formData.tradingName}
                      onChange={(e) => setFormData({ ...formData, tradingName: e.target.value })}
                      placeholder="e.g. ClinicEZ Manila Branch"
                      className="rounded-lg"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">If provided, this brand name will reflect on your invoices and receipts. Otherwise, the clinic name is used.</p>
                  </div>
                  
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="orgBusinessType" className="text-xs font-semibold text-foreground/80">Business Entity Type</Label>
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
                    <Label htmlFor="orgTaxId" className="text-xs font-semibold text-foreground/80">
                      Tax ID / TIN <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="orgTaxId"
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

                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="orgPhoneNumber" className="text-xs font-semibold text-foreground/80">
                      Mobile Phone Number (E.164) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="orgPhoneNumber"
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

                  <div className="space-y-1.5 col-span-2 border-t pt-4 mt-2">
                    <Label htmlFor="orgCountry" className="text-xs font-semibold text-foreground/80">
                      Country <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.country}
                      onValueChange={(val) => {
                        setFormData({ ...formData, country: val });
                        setTouchedFields(prev => ({ ...prev, country: true }));
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
                    <Label htmlFor="orgStreetLine1" className="text-xs font-semibold text-foreground/80">
                      Street Address Line 1 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="orgStreetLine1"
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
                    <Label htmlFor="orgStreetLine2" className="text-xs font-semibold text-foreground/80">Street Address Line 2 (Optional)</Label>
                    <Input
                      id="orgStreetLine2"
                      value={formData.streetLine2}
                      onChange={(e) => setFormData({ ...formData, streetLine2: e.target.value })}
                      placeholder="e.g. Village/Subdivision"
                      className="rounded-lg"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="orgCity" className="text-xs font-semibold text-foreground/80">
                      City / Municipality <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="orgCity"
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

                  <div className="space-y-1.5">
                    <Label htmlFor="orgProvince" className="text-xs font-semibold text-foreground/80">
                      Province / State <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="orgProvince"
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

                  <div className="space-y-1.5 col-span-2 md:col-span-1">
                    <Label htmlFor="orgPostalCode" className="text-xs font-semibold text-foreground/80">
                      Postal / Zip Code <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="orgPostalCode"
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

                <div className="flex justify-end pt-4 border-t">
                  <Button
                    type="submit"
                    disabled={isUpdatingInfo || !isValid}
                    className="rounded-full px-6 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdatingInfo ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </TabsContent>

        {/* 4. PAYMENT METHOD TAB CONTENT */}
        <TabsContent value="payment" className="outline-none space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 rounded-3xl border border-border bg-card p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Linked Payment Method</h3>
                  <p className="text-xs text-muted-foreground">Manage cards and account auto-debit authorizations</p>
                </div>
              </div>

              {isSubscribed ? (
                <div className="p-6 rounded-2xl bg-muted/40 border space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-16 bg-foreground/5 rounded-md border flex items-center justify-center font-bold text-xs tracking-widest text-muted-foreground">
                        CARD
                      </div>
                      <div>
                        <span className="block font-bold text-sm">Active Subscription Link</span>
                        <span className="block text-xs text-muted-foreground">Auto-charging enabled for {activePlanPrice}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Linked
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t">
                    Your credit card/payment method details are stored securely in compliance with PCI-DSS guidelines. To update your card number or link a new account, click the button below to load the secure dashboard.
                  </p>

                  <div className="pt-2">
                    <Button 
                      onClick={handleOpenPortal} 
                      disabled={isPortalLoading} 
                      className="rounded-full px-6 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    >
                      {isPortalLoading ? "Loading..." : "Manage Payment Methods"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-muted/30 border border-dashed text-center space-y-3">
                  <CreditCard className="h-10 w-10 mx-auto text-muted-foreground stroke-[1.5] opacity-60" />
                  <div>
                    <h4 className="font-bold text-sm">No payment method linked yet</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                      Subscriptions require authorizing a payment card or digital wallet (Gcash/Maya/etc.) via secure checkout link during plans setup.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Compliance & Trust signals */}
            <div className="rounded-3xl border border-border bg-card p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-2 font-bold text-sm text-foreground/80">
                <Lock className="h-4.5 w-4.5 text-primary" />
                Security & Compliance
              </div>

              <div className="space-y-4 text-xs leading-relaxed text-muted-foreground">
                <div className="p-3 bg-muted/40 rounded-xl space-y-1">
                  <span className="block font-bold text-foreground/80">PCI-DSS Compliant</span>
                  <p>All transactions are processed by a secure Level 1 PCI-DSS compliant vaulting service.</p>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl space-y-1">
                  <span className="block font-bold text-foreground/80">256-Bit SSL Encryption</span>
                  <p>Communication between backend servers and the payment processor is secured using high-grade TLS encryption.</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
                  <p className="text-[10px] text-muted-foreground">Required to authorize subscription notifications.</p>
                </div>
              </div>

              {/* Address Details Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b pb-1.5">Billing Address</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5 col-span-3">
                    <Label htmlFor="country" className="text-xs font-semibold text-foreground/80">
                      Country <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.country}
                      onValueChange={(val) => {
                        setFormData({ ...formData, country: val });
                        setTouchedFields(prev => ({ ...prev, country: true }));
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

                  <div className="space-y-1.5 col-span-3">
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

                  <div className="space-y-1.5 col-span-3">
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
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md rounded-3xl border border-red-500/20 bg-background shadow-2xl p-6">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-5.5 w-5.5 text-red-500 animate-pulse" />
              Cancel Subscription Plan
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-normal" asChild>
              <div className="space-y-3">
                <p className="mt-2 text-foreground/90">
                  Are you sure you want to cancel your ClinicEZ plan subscription?
                </p>
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-900 dark:text-red-300 flex gap-2">
                  <Clock className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span>
                    You will continue to have access to your plan benefits (Starter or Professional) until the end of your current paid billing cycle 
                    {billingInfo?.subscriptionExpiresAt && (
                      <span className="font-bold"> ({new Date(billingInfo.subscriptionExpiresAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric"
                      })})</span>
                    )}. After this date, advanced template access, laboratory connections, and unbounded files will be disabled.
                  </span>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              className="rounded-full px-5 text-xs font-semibold"
            >
              Keep Subscription
            </Button>
            <Button
              type="button"
              onClick={handleCancelSubscription}
              disabled={isCancelLoading}
              className="rounded-full px-5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm"
            >
              {isCancelLoading ? "Cancelling..." : "Cancel Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice/Receipt Detail Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="sm:max-w-xl rounded-3xl border border-primary/20 bg-background shadow-2xl p-0 overflow-hidden">
          <div className="p-6 bg-gradient-to-br from-primary/10 via-background to-background border-b border-primary/10">
            <DialogHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <FileText className="h-5.5 w-5.5 text-primary" />
                  {selectedInvoice?.status === "Paid" ? "Official Receipt" : "Official Invoice"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Processed securely via Xendit payments network
                </DialogDescription>
              </div>
              <div className="text-right">
                {selectedInvoice?.status === "Paid" ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Paid Status
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    Issued Status
                  </span>
                )}
              </div>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Invoice/Receipt Details Info */}
            <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 rounded-2xl p-4 border border-border/40">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  {selectedInvoice?.status === "Paid" ? "Receipt Number" : "Invoice Number"}
                </p>
                <p className="font-mono text-foreground mt-0.5">
                  {selectedInvoice?.status === "Paid" 
                    ? selectedInvoice?.receipt?.receiptNumber 
                    : selectedInvoice?.invoiceNumber}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  {selectedInvoice?.status === "Paid" ? "Transaction Date & Time" : "Invoice Date & Time"}
                </p>
                <p className="font-semibold text-foreground mt-0.5">
                  {selectedInvoice && (
                    selectedInvoice.status === "Paid" && selectedInvoice.receipt
                      ? new Date(selectedInvoice.receipt.paidAt).toLocaleString("en-US", {
                          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })
                      : new Date(selectedInvoice.createdAt).toLocaleString("en-US", {
                          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Billing Plan</p>
                <p className="font-semibold text-foreground capitalize mt-0.5">
                  {selectedInvoice?.planSlug} Plan ({selectedInvoice?.isAnnual ? "Annual" : "Monthly"})
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Coverage Period</p>
                <p className="font-semibold text-foreground mt-0.5">
                  {selectedInvoice && (
                    selectedInvoice.status === "Paid" && selectedInvoice.receipt ? (
                      <>
                        {new Date(selectedInvoice.receipt.paidAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                        {" - "}
                        {new Date(selectedInvoice.receipt.expiryDate).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                      </>
                    ) : (
                      <>
                        {new Date(selectedInvoice.createdAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                        {" - "}
                        {new Date(new Date(selectedInvoice.createdAt).setMonth(new Date(selectedInvoice.createdAt).getMonth() + (selectedInvoice.isAnnual ? 12 : 1))).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                      </>
                    )
                  )}
                </p>
              </div>
            </div>

            {/* Billing Entity Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1">Billing Details</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground">Clinic Name</p>
                  <p className="font-semibold text-foreground mt-0.5">{billingInfo?.clinicName || "Clinic Provider"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Trading Name / Brand</p>
                  <p className="font-semibold text-foreground mt-0.5">{billingInfo?.tradingName || "--"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Business Type</p>
                  <p className="font-semibold text-foreground capitalize mt-0.5">
                    {(billingInfo?.businessType || "SOLE_PROPRIETOR").replace("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">TIN / Tax ID</p>
                  <p className="font-semibold text-foreground mt-0.5">{billingInfo?.taxId || "--"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Billing Address</p>
                  <p className="font-semibold text-foreground mt-0.5">
                    {[
                      billingInfo?.streetLine1,
                      billingInfo?.streetLine2,
                      billingInfo?.city,
                      billingInfo?.province,
                      billingInfo?.postalCode,
                      billingInfo?.country
                    ].filter(Boolean).join(", ") || "--"}
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1">Amount Summary</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Subtotal</span>
                  <span>{selectedInvoice?.currency} {selectedInvoice?.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Tax (0% / VAT Exempt)</span>
                  <span>{selectedInvoice?.currency} 0</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 font-bold text-foreground">
                  <span>
                    {selectedInvoice?.status === "Paid" ? "Total Amount Paid" : "Total Amount Due"}
                  </span>
                  <span>{selectedInvoice?.currency} {selectedInvoice?.amount.toLocaleString()}</span>
                </div>
                {selectedInvoice?.status === "Paid" && selectedInvoice.receipt && (
                  <div className="flex justify-between text-muted-foreground text-xs pt-1">
                    <span>Payment Method</span>
                    <span>{selectedInvoice.receipt.paymentMethod}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 bg-muted/10 border-t border-border/40 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInvoiceDialog(false)}
              className="rounded-full px-5 text-xs font-semibold"
            >
              Close
            </Button>
            
            {/* View Original External Link if it is not a cycle recurring ID */}
            {selectedInvoice && !selectedInvoice.xenditInvoiceId.startsWith("recy_") && (
              <a
                href={
                  selectedInvoice.xenditInvoiceId.startsWith("http")
                    ? selectedInvoice.xenditInvoiceId
                    : /^[a-f\d]{24}$/i.test(selectedInvoice.xenditInvoiceId)
                      ? `https://checkout-staging.xendit.co/web/${selectedInvoice.xenditInvoiceId}`
                      : `https://checkout.xendit.co/web/invoices/${selectedInvoice.xenditInvoiceId}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/80 px-5 text-xs font-semibold text-secondary-foreground transition-colors mr-auto"
              >
                View on Xendit
              </a>
            )}

            {selectedInvoice?.status === "Paid" && selectedInvoice.receipt && (
              <Button
                type="button"
                onClick={() => {
                  if (selectedInvoice.receipt) {
                    printReceipt(selectedInvoice.receipt, billingInfo || null, selectedInvoice.planSlug, selectedInvoice.isAnnual, selectedInvoice.xenditInvoiceId)
                  }
                }}
                className="rounded-full px-5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Receipt
              </Button>
            )}

            <Button
              type="button"
              onClick={() => {
                if (selectedInvoice) {
                  printInvoice(selectedInvoice, billingInfo || null)
                }
              }}
              className="rounded-full px-5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
