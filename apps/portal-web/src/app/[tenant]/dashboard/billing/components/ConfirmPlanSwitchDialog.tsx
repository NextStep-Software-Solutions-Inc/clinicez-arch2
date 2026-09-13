"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  CheckCircle2, 
  ShieldCheck, 
  AlertTriangle,
  Info
} from "lucide-react"
import { BillingInfo } from "@/services/billing.service"

interface ConfirmPlanSwitchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  billingInfo: BillingInfo | null
  isSubscribedAnnual: boolean
  pendingPlanId: string | null
  pendingIsAnnual: boolean
  isLoading: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmPlanSwitchDialog({
  open,
  onOpenChange,
  billingInfo,
  isSubscribedAnnual,
  pendingPlanId,
  pendingIsAnnual,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmPlanSwitchDialogProps) {
  const currentPlan = billingInfo?.subscriptionPlanId?.toLowerCase() === "pro" ? "professional" : "starter"
  const newPlan = pendingPlanId
  
  const isTierDowngrade = currentPlan === "professional" && newPlan === "starter"
  const isCycleDowngradeOnly = currentPlan === newPlan && isSubscribedAnnual && !pendingIsAnnual

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border border-primary/20 bg-background shadow-2xl p-6">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            {isTierDowngrade && (
              <>
                <AlertTriangle className="h-5.5 w-5.5 text-amber-500" />
                Confirm Plan Downgrade
              </>
            )}
            {isCycleDowngradeOnly && (
              <>
                <Info className="h-5.5 w-5.5 text-blue-500" />
                Confirm Cycle Change
              </>
            )}
            {!isTierDowngrade && !isCycleDowngradeOnly && (
              <>
                <ShieldCheck className="h-5.5 w-5.5 text-primary" />
                Confirm Plan Upgrade
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-normal" asChild>
            {(() => {
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
            onClick={onCancel}
            className="rounded-full px-5 text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-full px-5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isLoading ? "Redirecting..." : "Confirm & Proceed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
