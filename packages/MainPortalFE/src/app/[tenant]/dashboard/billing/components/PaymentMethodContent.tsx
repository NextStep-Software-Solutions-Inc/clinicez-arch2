"use client"

import React, { useState } from "react"
import { useBillingInfo } from "@/hooks/useBilling"
import { billingService } from "@/services/billing.service"
import { Button } from "@/components/ui/button"
import { CreditCard, Lock } from "lucide-react"
import { toast } from "sonner"

interface PaymentMethodContentProps {
  tenantId: string
}

export default function PaymentMethodContent({ tenantId }: PaymentMethodContentProps) {
  const { billingInfo } = useBillingInfo(tenantId)
  const [isPortalLoading, setIsPortalLoading] = useState(false)

  const isSubscribed = 
    billingInfo?.subscriptionStatus === "ACTIVE" || 
    (billingInfo?.subscriptionStatus === "CANCELLED" && 
     !!billingInfo.subscriptionExpiresAt && 
     new Date(billingInfo.subscriptionExpiresAt) > new Date())
  const isSubscribedAnnual = billingInfo?.isAnnual ?? false
  const activePlanPrice = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" 
    ? (isSubscribedAnnual ? "₱5,940" : "₱7,740") 
    : (isSubscribedAnnual ? "₱2,340" : "₱2,940")

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

  return (
    <div className="grid md:grid-cols-3 gap-6 animate-in fade-in-50 duration-300">
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
  )
}
