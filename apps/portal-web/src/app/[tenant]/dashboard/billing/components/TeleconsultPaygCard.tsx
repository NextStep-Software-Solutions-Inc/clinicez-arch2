"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Video,
  Clock,
  ShieldCheck,
  Zap,
  CreditCard,
  AlertCircle,
  HelpCircle,
  Loader2,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeleconsultBilling } from "@/hooks/useTeleconsultBilling";

interface TeleconsultPaygCardProps {
  tenantSlug: string;
  className?: string;
}

export function TeleconsultPaygCard({ tenantSlug, className }: TeleconsultPaygCardProps) {
  const { billing, isLoading, error, updateBilling, createTopUpCheckout } = useTeleconsultBilling(tenantSlug);

  const [isEnabled, setIsEnabled] = useState(false);
  const [billingMode, setBillingMode] = useState<"Prepaid" | "Postpaid">("Postpaid");
  const [allocatedBudgetPhp, setAllocatedBudgetPhp] = useState<number>(0);
  const [prepaidTopUpPhp, setPrepaidTopUpPhp] = useState<number>(0);
  const [allowOverageBeyondAllocation, setAllowOverageBeyondAllocation] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [offlineTopUpNotice, setOfflineTopUpNotice] = useState<string | null>(null);

  const isOnlinePaymentSupported = Boolean(billing?.isOnlinePaymentSupported);
  const hasCardOnFile = Boolean(billing?.hasCardOnFile);
  const isPostpaidAllowed = isOnlinePaymentSupported && hasCardOnFile;

  // Sync state when billing data is received
  useEffect(() => {
    if (billing) {
      setIsEnabled(Boolean(billing.isEnabled));
      const canUsePostpaid = Boolean(billing.isOnlinePaymentSupported && billing.hasCardOnFile);
      setBillingMode(billing.billingMode === "Postpaid" && canUsePostpaid ? "Postpaid" : "Prepaid");
      setAllocatedBudgetPhp(billing.allocatedBudgetPhp ?? 0);
      setAllowOverageBeyondAllocation(billing.allowOverageBeyondAllocation ?? true);
      setPrepaidTopUpPhp(0);
    }
  }, [billing]);

  const ratePerMinute = billing?.ratePerMinutePhp ?? 5.0;

  // Live minute calculations
  const postpaidConvertedMinutes =
    allocatedBudgetPhp > 0 && ratePerMinute > 0
      ? Math.floor(allocatedBudgetPhp / ratePerMinute)
      : 0;

  const prepaidCurrentMinutes =
    billing?.prepaidBalancePhp && ratePerMinute > 0
      ? Math.floor(billing.prepaidBalancePhp / ratePerMinute)
      : 0;

  const prepaidTopUpConvertedMinutes =
    prepaidTopUpPhp > 0 && ratePerMinute > 0
      ? Math.floor(prepaidTopUpPhp / ratePerMinute)
      : 0;

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updateBilling({
        isEnabled,
        billingMode,
        allocatedBudgetPhp: Number(allocatedBudgetPhp) || 0,
        allowOverageBeyondAllocation,
      });
      toast.success("Video call billing settings saved.");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || "Failed to save video call billing settings."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTopUpCheckout = async () => {
    const amount = Number(prepaidTopUpPhp) || 0;
    if (amount < 50) {
      toast.error("Minimum top-up amount is ₱50.");
      return;
    }

    try {
      setIsToppingUp(true);
      setOfflineTopUpNotice(null);
      const { url } = await createTopUpCheckout(amount);
      if (url && typeof window !== "undefined") {
        window.location.href = url;
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to start top-up payment.";
      if (status === 503) {
        setOfflineTopUpNotice(msg);
        toast.info("Online checkout is unavailable. Please pay via Bank Transfer or GCash.");
      } else {
        toast.error(msg);
      }
    } finally {
      setIsToppingUp(false);
    }
  };

  if (isLoading && !billing) {
    return (
      <Card className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      data-testid="teleconsult-payg-card"
      className={`rounded-3xl border border-border bg-card shadow-sm transition-all overflow-hidden ${className ?? ""}`}
    >
      <CardHeader className="p-6 pb-4 border-b border-border bg-card/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <Video className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg font-bold text-card-foreground">
                Video Teleconsultation
              </CardTitle>
              <Badge
                variant="outline"
                className={
                  isEnabled
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-xs font-semibold"
                    : "bg-muted text-muted-foreground border-border text-xs font-semibold"
                }
              >
                {isEnabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Encrypted HD video consultations billed at{" "}
              <span className="font-semibold text-card-foreground">₱{ratePerMinute.toFixed(2)} / min</span>.
            </CardDescription>
          </div>

          {/* Master Enablement Switch */}
          <div className="flex items-center justify-between gap-3 bg-muted/50 p-2.5 px-4 rounded-2xl border border-border shrink-0">
            <span className="text-xs font-semibold text-card-foreground">
              Enable for Workspace
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              data-testid="toggle-teleconsult-payg"
              {...({ testID: "toggle-teleconsult-payg" } as any)}
              onClick={() => setIsEnabled((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                isEnabled ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  isEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Clinic Access & Separate Billing Banner */}
        <div className="flex gap-3.5 items-start rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-card-foreground">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-card-foreground">
              How Billing &amp; Clinic Access Work
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Video calls are billed separately from your subscription plan at{" "}
              <span className="font-semibold text-card-foreground">₱{ratePerMinute.toFixed(2)} / min</span>.
              Turning this on lets clinic admins enable video calls for their clinics; turning it off disables video calls across all clinics.
            </p>
          </div>
        </div>

        {/* Mode Selector & Configuration (disabled when teleconsultation is off) */}
        <div
          aria-disabled={!isEnabled}
          className={`space-y-6 transition-opacity ${!isEnabled ? "opacity-50 pointer-events-none select-none" : ""}`}
        >
        <div className="space-y-4">
          <Label className="text-xs font-bold text-card-foreground">Billing Mode</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!isEnabled || !isPostpaidAllowed}
              onClick={() => {
                if (isPostpaidAllowed) setBillingMode("Postpaid");
              }}
              className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 ${
                !isEnabled || !isPostpaidAllowed
                  ? "border-border bg-muted/40 opacity-60 cursor-not-allowed"
                  : billingMode === "Postpaid"
                    ? "border-primary bg-primary/5 shadow-xs cursor-pointer"
                    : "border-border bg-card hover:bg-muted/50 cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-card-foreground flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  Postpaid (Pay Monthly)
                </span>
                {billingMode === "Postpaid" && isPostpaidAllowed && (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Pay at the end of each month for the minutes you use, with an optional monthly spending limit.
              </p>
              {!isPostpaidAllowed && (
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  {!isOnlinePaymentSupported
                    ? "Unavailable — online card payments are not enabled yet."
                    : "Requires a credit card on file."}
                </p>
              )}
            </button>

            <button
              type="button"
              disabled={!isEnabled}
              onClick={() => setBillingMode("Prepaid")}
              className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 ${
                !isEnabled
                  ? "border-border bg-muted/40 cursor-not-allowed"
                  : billingMode === "Prepaid"
                    ? "border-primary bg-primary/5 shadow-xs cursor-pointer"
                    : "border-border bg-card hover:bg-muted/50 cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-card-foreground flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Prepaid (Pay in Advance)
                </span>
                {billingMode === "Prepaid" && (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Load credits in advance. Call minutes are deducted from your balance as calls happen.
              </p>
            </button>
          </div>
        </div>

        {/* Mode-Specific Input Panel */}
        {billingMode === "Postpaid" ? (
          <div className="p-4 rounded-2xl border border-border bg-muted/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Label htmlFor="input-allocated-budget" className="text-xs font-semibold text-card-foreground">
                Monthly Spending Limit (₱)
              </Label>
              <span className="text-xs font-mono text-primary font-semibold">
                {allocatedBudgetPhp > 0
                  ? `~${postpaidConvertedMinutes.toLocaleString()} minutes at ₱${ratePerMinute.toFixed(2)} / min`
                  : "No Limit"}
              </span>
            </div>
            <Input
              id="input-allocated-budget"
              type="number"
              min="0"
              step="50"
              disabled={!isEnabled}
              value={allocatedBudgetPhp || ""}
              onChange={(e) => setAllocatedBudgetPhp(Math.max(0, Number(e.target.value)))}
              placeholder="0 (No monthly limit)"
              className="bg-card border-border font-mono text-xs rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">
              Enter 0 for no monthly limit, or set a target monthly spending limit in Philippine Pesos (₱).
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-border bg-muted/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
              <span className="text-xs text-muted-foreground">Current Balance:</span>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold text-card-foreground font-mono">
                  ₱{(billing?.prepaidBalancePhp ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({prepaidCurrentMinutes.toLocaleString()} mins available)
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label htmlFor="input-prepaid-topup" className="text-xs font-semibold text-card-foreground">
                  Top Up Credits (₱)
                </Label>
                {prepaidTopUpPhp > 0 && (
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    +{prepaidTopUpConvertedMinutes.toLocaleString()} mins
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="input-prepaid-topup"
                  type="number"
                  min="50"
                  step="50"
                  disabled={!isEnabled || !isOnlinePaymentSupported}
                  value={prepaidTopUpPhp || ""}
                  onChange={(e) => setPrepaidTopUpPhp(Math.max(0, Number(e.target.value)))}
                  placeholder="Enter amount in ₱ (min ₱50)"
                  className="bg-card border-border font-mono text-xs rounded-xl flex-1"
                />
                <Button
                  type="button"
                  data-testid="btn-topup-teleconsult-payg"
                  onClick={handleTopUpCheckout}
                  disabled={!isEnabled || !isOnlinePaymentSupported || isToppingUp || prepaidTopUpPhp < 50}
                  className="rounded-xl px-4 text-xs font-bold shrink-0"
                >
                  {isToppingUp && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Pay &amp; Top Up
                </Button>
              </div>
              {!isOnlinePaymentSupported ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-900 dark:text-amber-200">
                  Online self-service payments are not enabled yet. To top up credits, pay via Bank Transfer or GCash and send your receipt to billing@clinicez.ph.
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Credits are added to your balance once payment is completed (₱{ratePerMinute.toFixed(2)} / min, minimum ₱50).
                </p>
              )}
              {offlineTopUpNotice && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-900 dark:text-amber-200">
                  {offlineTopUpNotice}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Overage & Patient Safety Notice */}
        <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="chk-allow-overage"
              disabled={!isEnabled}
              checked={allowOverageBeyondAllocation}
              onCheckedChange={(checked) => setAllowOverageBeyondAllocation(Boolean(checked))}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label
                htmlFor="chk-allow-overage"
                className="text-xs font-semibold text-card-foreground cursor-pointer"
              >
                Don&apos;t cut off ongoing calls
              </Label>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Keep active calls running if your balance or monthly limit is reached. Extra minutes are billed separately.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p>
              <span className="font-bold">Patient Safety Notice:</span> Active video calls are never disconnected mid-call, even if your balance reaches ₱0.00 or you hit your monthly limit. Extra minutes are added to your bill.
            </p>
          </div>
        </div>
        </div>

        {/* Monthly Usage Summary */}
        <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-card-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              This Month&apos;s Usage ({billing?.currentPeriodYearMonth || "Current Month"})
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              Rate: ₱{ratePerMinute.toFixed(2)}/min
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="p-2.5 rounded-xl bg-card border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Minutes Used</span>
              <p className="text-sm font-bold text-card-foreground font-mono">
                {billing?.currentPeriodMinutesUsed?.toLocaleString() ?? 0}
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Amount Billed</span>
              <p className="text-sm font-bold text-card-foreground font-mono">
                ₱{(billing?.currentPeriodBilledPhp ?? 0).toFixed(2)}
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Extra Charges</span>
              <p className="text-sm font-bold text-card-foreground font-mono text-amber-600 dark:text-amber-400">
                ₱{(billing?.currentPeriodOveragePhp ?? 0).toFixed(2)}
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Available Minutes</span>
              <p className="text-sm font-bold text-card-foreground font-mono text-emerald-600 dark:text-emerald-400">
                {billing?.estimatedAvailableMinutes === 2147483647
                  ? "Unlimited"
                  : (billing?.estimatedAvailableMinutes ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Save Action */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            data-testid="btn-save-teleconsult-payg"
            {...({ testID: "btn-save-teleconsult-payg" } as any)}
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-xl px-6 py-2.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors shadow-xs"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
export default TeleconsultPaygCard;
