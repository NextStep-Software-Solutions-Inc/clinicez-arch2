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
import { AlertTriangle, Clock } from "lucide-react"

interface CancelPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expiryDate?: string
  onConfirm: () => Promise<void>
  isLoading: boolean
}

export default function CancelPlanDialog({
  open,
  onOpenChange,
  expiryDate,
  onConfirm,
  isLoading,
}: CancelPlanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  {expiryDate && (
                    <span className="font-bold"> ({new Date(expiryDate).toLocaleDateString("en-US", {
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
            onClick={() => onOpenChange(false)}
            className="rounded-full px-5 text-xs font-semibold"
          >
            Keep Subscription
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-full px-5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm"
          >
            {isLoading ? "Cancelling..." : "Cancel Subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
