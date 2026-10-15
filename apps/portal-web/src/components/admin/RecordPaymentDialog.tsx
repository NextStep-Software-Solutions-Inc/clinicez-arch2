"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  adminService,
  BillingPlan,
  RecordManualPaymentPayload,
  RecordManualPaymentResult
} from "@/services/admin.service";
import {
  IconLoader,
  IconCheck,
  IconReceipt,
  IconCreditCard,
  IconBuildingBank,
  IconCash,
  IconDeviceMobile,
  IconSparkles,
  IconFileText,
  IconCalendar,
  IconCopy,
  IconCircleCheck
} from "@tabler/icons-react";

export interface RecordPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: RecordManualPaymentResult) => void;
  tenantId: string;
  tenantSlug: string;
  clinicName: string;
  currentPlanSlug?: string;
}

const PAYMENT_METHODS = [
  { value: "Bank Transfer", label: "Bank Transfer (BDO / BPI / Metrobank / UnionBank)", icon: IconBuildingBank },
  { value: "GCash/Maya", label: "GCash / Maya QR / Mobile E-Wallet", icon: IconDeviceMobile },
  { value: "Check", label: "Corporate Manager's / Business Check", icon: IconFileText },
  { value: "Cash", label: "Direct Cash / Counter Deposit", icon: IconCash },
  { value: "Promotional", label: "Promotional / Commercial Sponsorship (Zero Cost)", icon: IconSparkles }
];

export function RecordPaymentDialog({
  isOpen,
  onClose,
  onSuccess,
  tenantId,
  tenantSlug,
  clinicName,
  currentPlanSlug
}: RecordPaymentDialogProps) {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Form State
  const [planSlug, setPlanSlug] = useState("");
  const [isAnnual, setIsAnnual] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [transactionReference, setTransactionReference] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<RecordManualPaymentResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setSuccessResult(null);
    setPaymentDate(new Date().toISOString().split("T")[0]);

    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        const fetched = await adminService.getPlans();
        const sorted = [...fetched].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        setPlans(sorted);

        // Pre-select current plan or first plan
        const initialSlug = currentPlanSlug && sorted.some(p => p.slug === currentPlanSlug)
          ? currentPlanSlug
          : (sorted[0]?.slug || "starter");

        setPlanSlug(initialSlug);
        updateInitialAmount(sorted, initialSlug, isAnnual);
      } catch (err: any) {
        toast.error("Failed to load plans for payment recording");
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, [isOpen, tenantId, currentPlanSlug]);

  const updateInitialAmount = (planList: BillingPlan[], slug: string, annual: boolean) => {
    const p = planList.find(x => x.slug === slug);
    if (!p) return;
    const mPrice = typeof p.monthlyPrice === "number" ? p.monthlyPrice : (typeof p.priceMonthly === "number" ? p.priceMonthly : parseFloat(String(p.priceMonthly || 0)) || 0);
    const aPrice = typeof p.annualPrice === "number" ? p.annualPrice : (typeof p.priceAnnually === "number" ? p.priceAnnually : parseFloat(String(p.priceAnnually || 0)) || 0);
    setAmount(annual ? aPrice : mPrice);
  };

  const handlePlanChange = (slug: string) => {
    setPlanSlug(slug);
    const p = plans.find(x => x.slug === slug);
    if (p && paymentMethod !== "Promotional") {
      const mPrice = typeof p.monthlyPrice === "number" ? p.monthlyPrice : (typeof p.priceMonthly === "number" ? p.priceMonthly : parseFloat(String(p.priceMonthly || 0)) || 0);
      const aPrice = typeof p.annualPrice === "number" ? p.annualPrice : (typeof p.priceAnnually === "number" ? p.priceAnnually : parseFloat(String(p.priceAnnually || 0)) || 0);
      setAmount(isAnnual ? aPrice : mPrice);
    }
  };

  const handleCycleChange = (annual: boolean) => {
    setIsAnnual(annual);
    const p = plans.find(x => x.slug === planSlug);
    if (p && paymentMethod !== "Promotional") {
      const mPrice = typeof p.monthlyPrice === "number" ? p.monthlyPrice : (typeof p.priceMonthly === "number" ? p.priceMonthly : parseFloat(String(p.priceMonthly || 0)) || 0);
      const aPrice = typeof p.annualPrice === "number" ? p.annualPrice : (typeof p.priceAnnually === "number" ? p.priceAnnually : parseFloat(String(p.priceAnnually || 0)) || 0);
      setAmount(annual ? aPrice : mPrice);
    }
  };

  const handlePaymentMethodChange = (method: string) => {
    setPaymentMethod(method);
    if (method === "Promotional") {
      setAmount(0);
      if (!transactionReference) {
        setTransactionReference(`PROMO-${tenantSlug.toUpperCase().slice(0, 8)}`);
      }
    } else if (amount === 0) {
      const p = plans.find(x => x.slug === planSlug);
      if (p) {
        const mPrice = typeof p.monthlyPrice === "number" ? p.monthlyPrice : (typeof p.priceMonthly === "number" ? p.priceMonthly : parseFloat(String(p.priceMonthly || 0)) || 0);
        const aPrice = typeof p.annualPrice === "number" ? p.annualPrice : (typeof p.priceAnnually === "number" ? p.priceAnnually : parseFloat(String(p.priceAnnually || 0)) || 0);
        setAmount(isAnnual ? aPrice : mPrice);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!planSlug) {
      toast.error("Please select a target plan tier.");
      return;
    }

    if (amount < 0) {
      toast.error("Payment amount cannot be negative.");
      return;
    }

    if (paymentMethod !== "Cash" && paymentMethod !== "Promotional" && !transactionReference.trim()) {
      toast.error(`Transaction reference is required for ${paymentMethod}.`);
      return;
    }

    try {
      setSubmitting(true);
      const payload: RecordManualPaymentPayload = {
        planSlug,
        isAnnual,
        paymentMethod,
        transactionReference: transactionReference.trim() || undefined,
        amount: Number(amount),
        notes: notes.trim() || undefined,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined
      };

      const result = await adminService.recordManualPayment(tenantId, payload);
      setSuccessResult(result);
      toast.success(`Payment recorded! Invoice ${result.invoiceNumber} generated.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || "Failed to record manual payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const handleDone = () => {
    if (successResult) {
      onSuccess(successResult);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && (successResult ? handleDone() : onClose())}>
      <DialogContent className="max-w-xl rounded-3xl border-border bg-background p-0 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/20">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <IconReceipt className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                  Record Manual / Offline Payment
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Workspace: <strong className="text-foreground">{clinicName}</strong> ({tenantSlug})
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* If Success View */}
        {successResult ? (
          <div className="p-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center space-y-2 py-2">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-sm">
                <IconCircleCheck className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-extrabold text-foreground tracking-tight">
                Payment Recorded &amp; Subscription Activated!
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Official BIR-compliant invoice and payment receipt have been generated, and cryptographic facility licenses staged.
              </p>
            </div>

            {/* Generated Documents Card */}
            <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
              <div className="flex items-center justify-between py-1 border-b border-border/60">
                <span className="text-xs text-muted-foreground font-semibold">Official Invoice No.</span>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">
                    {successResult.invoiceNumber}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(successResult.invoiceNumber, "Invoice Number")}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/60">
                <span className="text-xs text-muted-foreground font-semibold">Official Receipt No.</span>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">
                    {successResult.receiptNumber}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(successResult.receiptNumber, "Receipt Number")}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/60">
                <span className="text-xs text-muted-foreground font-semibold">Subscription Status</span>
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold text-xs">
                  <IconCheck className="h-3.5 w-3.5 mr-1" /> {successResult.status}
                </Badge>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-border/60">
                <span className="text-xs text-muted-foreground font-semibold">Subscription Expiry</span>
                <span className="text-xs font-bold text-foreground">
                  {new Date(successResult.subscriptionExpiresAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-muted-foreground font-semibold">Licensed Facilities Staged</span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {successResult.facilitiesLicensed} {successResult.facilitiesLicensed === 1 ? "facility" : "facilities"} (v{successResult.entitlementVersion})
                </span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                onClick={handleDone}
                className="w-full rounded-xl py-5 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md cursor-pointer"
              >
                Done &amp; Refresh Workspace Details
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Payment Input Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Plan Tier Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Target Plan Tier *
              </label>
              <select
                required
                value={planSlug}
                onChange={(e) => handlePlanChange(e.target.value)}
                disabled={loadingPlans || submitting}
                className="w-full h-11 px-3.5 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              >
                {plans.map((p) => {
                  const mPrice = typeof p.monthlyPrice === "number" ? p.monthlyPrice : (typeof p.priceMonthly === "number" ? p.priceMonthly : parseFloat(String(p.priceMonthly || 0)) || 0);
                  const aPrice = typeof p.annualPrice === "number" ? p.annualPrice : (typeof p.priceAnnually === "number" ? p.priceAnnually : parseFloat(String(p.priceAnnually || 0)) || 0);
                  return (
                    <option key={p.slug} value={p.slug}>
                      {p.name} (Rank {p.rank}) — ₱{mPrice.toLocaleString()}/mo · ₱{aPrice.toLocaleString()}/yr
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Billing Cycle Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Billing Cycle *
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-muted/40 border border-border">
                <button
                  type="button"
                  onClick={() => handleCycleChange(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    isAnnual
                      ? "bg-background text-foreground shadow-xs border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <IconCalendar className="h-4 w-4" />
                  Annual (12 Months)
                </button>
                <button
                  type="button"
                  onClick={() => handleCycleChange(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    !isAnnual
                      ? "bg-background text-foreground shadow-xs border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <IconCalendar className="h-4 w-4" />
                  Monthly (1 Month)
                </button>
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Payment Method *
              </label>
              <select
                required
                value={paymentMethod}
                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                disabled={submitting}
                className="w-full h-11 px-3.5 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Transaction Reference & Amount Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Transaction Reference {paymentMethod !== "Cash" && paymentMethod !== "Promotional" && <span className="text-destructive">*</span>}
                </label>
                <input
                  type="text"
                  required={paymentMethod !== "Cash" && paymentMethod !== "Promotional"}
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder="e.g. BDO-982141, GCASH-7819"
                  className="w-full h-11 px-3.5 text-sm font-mono font-bold rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Amount Paid (PHP ₱) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full h-11 pl-8 pr-3 text-sm font-mono font-bold rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Payment Date & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full h-11 px-3.5 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Audit Notes / Remarks
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Deposit verified by Finance"
                  className="w-full h-11 px-3.5 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-xl text-xs font-bold px-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer"
              >
                {submitting ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <IconReceipt className="h-4 w-4 mr-1.5" />
                    Record Payment &amp; Activate
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
