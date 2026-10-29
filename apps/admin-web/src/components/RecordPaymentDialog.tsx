import React, { useState, useEffect } from 'react';
import {
  adminService,
  BillingPlan,
  RecordManualPaymentPayload,
  RecordManualPaymentResult,
} from '@/services/admin.service';
import { toast } from 'sonner';
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
  IconCopy,
  IconX,
  IconCircleCheck,
} from '@tabler/icons-react';

export interface RecordPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: RecordManualPaymentResult) => void;
  tenantId: string;
  tenantSlug: string;
  clinicName: string;
  currentPlanSlug?: string;
}

export const PAYMENT_METHODS = [
  { value: "Bank Transfer", label: "Bank Transfer (BDO / BPI / Metrobank / UnionBank)", icon: IconBuildingBank },
  { value: "GCash/Maya", label: "GCash / Maya QR / Mobile E-Wallet", icon: IconDeviceMobile },
  { value: "Check", label: "Corporate Manager's / Business Check", icon: IconFileText },
  { value: "Cash", label: "Direct Cash / Counter Deposit", icon: IconCash },
  { value: "Promotional", label: "Promotional / Commercial Sponsorship (Zero Cost)", icon: IconSparkles },
];

export function calculateBirVat(amount: number, isVatInclusive: boolean = true) {
  if (isVatInclusive) {
    const netAmount = Math.round((amount / 1.12) * 100) / 100;
    const vatAmount = Math.round((amount - netAmount) * 100) / 100;
    return { netAmount, vatAmount, grossAmount: amount };
  } else {
    const vatAmount = Math.round(amount * 0.12 * 100) / 100;
    const grossAmount = Math.round((amount + vatAmount) * 100) / 100;
    return { netAmount: amount, vatAmount, grossAmount };
  }
}

export function RecordPaymentDialog({
  isOpen,
  onClose,
  onSuccess,
  tenantId,
  tenantSlug,
  clinicName,
  currentPlanSlug,
}: RecordPaymentDialogProps) {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Form State
  const [planSlug, setPlanSlug] = useState('');
  const [isAnnual, setIsAnnual] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [transactionReference, setTransactionReference] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<RecordManualPaymentResult | null>(null);

  const updateInitialAmount = (planList: BillingPlan[], slug: string, annual: boolean) => {
    const p = planList.find((x) => x.slug === slug);
    if (!p) return;
    const mPrice = typeof p.monthlyPrice === 'number' ? p.monthlyPrice : 0;
    const aPrice = typeof p.annualPrice === 'number' ? p.annualPrice : 0;
    setAmount(annual ? aPrice : mPrice);
  };

  useEffect(() => {
    if (!isOpen) return;

    setSuccessResult(null);
    setPaymentDate(new Date().toISOString().split('T')[0]);

    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        const fetched = await adminService.getPlans();
        const sorted = [...fetched].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        setPlans(sorted);

        const initialSlug =
          currentPlanSlug && sorted.some((p) => p.slug === currentPlanSlug)
            ? currentPlanSlug
            : sorted[0]?.slug || '';

        setPlanSlug(initialSlug);
        updateInitialAmount(sorted, initialSlug, isAnnual);
      } catch (err: any) {
        toast.error('Failed to load subscription plans');
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, [isOpen, currentPlanSlug]);

  const handlePlanChange = (slug: string) => {
    setPlanSlug(slug);
    updateInitialAmount(plans, slug, isAnnual);
  };

  const handleCycleChange = (annual: boolean) => {
    setIsAnnual(annual);
    updateInitialAmount(plans, planSlug, annual);
  };

  const handlePaymentMethodChange = (method: string) => {
    setPaymentMethod(method);
    if (method === 'Promotional') {
      setAmount(0);
      if (!transactionReference) {
        setTransactionReference(`PROMO-${tenantSlug.toUpperCase().slice(0, 8)}`);
      }
    } else if (amount === 0) {
      const p = plans.find((x) => x.slug === planSlug);
      if (p) {
        const mPrice = typeof p.monthlyPrice === 'number' ? p.monthlyPrice : (typeof p.priceMonthly === 'number' ? p.priceMonthly : parseFloat(String(p.priceMonthly || 0)) || 0);
        const aPrice = typeof p.annualPrice === 'number' ? p.annualPrice : (typeof p.priceAnnually === 'number' ? p.priceAnnually : parseFloat(String(p.priceAnnually || 0)) || 0);
        setAmount(isAnnual ? aPrice : mPrice);
      }
    }
  };

  const vatBreakdown = calculateBirVat(amount, true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!planSlug) {
      toast.error('Please select a target plan tier.');
      return;
    }

    if (amount < 0) {
      toast.error('Payment amount cannot be negative.');
      return;
    }

    if (paymentMethod !== "Cash" && paymentMethod !== "Promotional" && !transactionReference.trim()) {
      toast.error(`Transaction reference is required for ${paymentMethod}.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: RecordManualPaymentPayload = {
        planSlug,
        isAnnual,
        paymentMethod,
        transactionReference: transactionReference.trim() || undefined,
        amount,
        paymentDate: new Date(paymentDate).toISOString(),
        notes: notes.trim() || undefined,
      };

      const result = await adminService.recordManualPayment(tenantId, payload);
      setSuccessResult(result);
      toast.success(`Payment recorded! Invoice #${result.invoiceNumber} created.`);
      onSuccess(result);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to record manual payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-subtle text-primary">
              <IconCreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Record Offline Manual Payment</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {clinicName} ({tenantSlug})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 max-h-[75vh] overflow-y-auto text-xs space-y-4">
          {successResult ? (
            /* Success Receipt Modal */
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <IconCircleCheck className="h-6 w-6 shrink-0" />
                <div>
                  <div className="font-bold">Transaction Confirmed & License Issued</div>
                  <div className="text-[11px] opacity-90">
                    Official BIR VAT invoice #{successResult.invoiceNumber} generated.
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-3 font-mono text-[11px]">
                <div className="flex justify-between pb-2 border-b border-border font-sans font-semibold text-text">
                  <span>Billing Summary</span>
                  <span className="text-primary font-mono">{successResult.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted font-sans">Payment Method:</span>
                  <span className="text-text font-sans font-medium">{successResult.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted font-sans">Transaction Reference:</span>
                  <span className="text-text">{successResult.transactionReference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted font-sans">VAT Net (12% Excl.):</span>
                  <span className="text-text">₱{vatBreakdown.netAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted font-sans">VAT Amount (12%):</span>
                  <span className="text-text">₱{vatBreakdown.vatAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border font-bold text-xs text-text">
                  <span className="font-sans">Total Gross Paid:</span>
                  <span className="text-primary">₱{successResult.amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Invoice: ${successResult.invoiceNumber}\nReference: ${successResult.transactionReference}\nGross: ₱${successResult.amount}`
                    );
                    toast.success('Receipt details copied to clipboard');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
                >
                  <IconCopy className="h-4 w-4" />
                  <span>Copy Receipt Summary</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Payment Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Plan & Cycle Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Subscription Tier</label>
                  <select
                    value={planSlug}
                    onChange={(e) => handlePlanChange(e.target.value)}
                    disabled={loadingPlans || submitting}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  >
                    {plans.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name} (Rank {p.rank})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Billing Cadence</label>
                  <div className="grid grid-cols-2 p-1 bg-surface-muted rounded-xl border border-border text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => handleCycleChange(false)}
                      className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                        !isAnnual
                          ? 'bg-surface text-text shadow-xs'
                          : 'text-text-muted hover:text-text'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCycleChange(true)}
                      className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                        isAnnual
                          ? 'bg-surface text-text shadow-xs'
                          : 'text-text-muted hover:text-text'
                      }`}
                    >
                      Annual
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5">
                <label className="font-semibold text-text">Payment Channel / Instrument</label>
                <div className="grid grid-cols-1 gap-2">
                  {PAYMENT_METHODS.map((pm) => {
                    const Icon = pm.icon;
                    const isSelected = paymentMethod === pm.value;
                    return (
                      <button
                        key={pm.value}
                        type="button"
                        onClick={() => handlePaymentMethodChange(pm.value)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary-subtle text-primary'
                            : 'border-border bg-surface hover:bg-surface-muted text-text'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="font-medium">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Gross Amount (PHP)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    disabled={paymentMethod === 'Promotional' || submitting}
                    min="0"
                    step={100}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">
                    Transaction / Check Ref # {paymentMethod !== "Cash" && paymentMethod !== "Promotional" && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                    disabled={submitting}
                    required={paymentMethod !== "Cash" && paymentMethod !== "Promotional"}
                    placeholder={
                      paymentMethod === 'Promotional'
                        ? 'PROMO-SPONSORED'
                        : 'e.g. BDO-TX-849302194'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 12% BIR VAT Breakdown */}
              <div className="p-3.5 rounded-xl bg-surface-muted border border-border text-[11px] space-y-1.5">
                <div className="font-semibold text-text flex items-center justify-between pb-1 border-b border-border">
                  <span>BIR 12% Value Added Tax Calculation</span>
                  <span className="text-text-muted">VAT-Inclusive</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Net Amount:</span>
                  <span className="font-mono text-text">₱{vatBreakdown.netAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>12% VAT:</span>
                  <span className="font-mono text-text">₱{vatBreakdown.vatAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-text pt-1 border-t border-border">
                  <span>Gross Invoice Total:</span>
                  <span className="font-mono text-primary">₱{vatBreakdown.grossAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Date & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Payment Execution Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Administrative Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. Paid in full via BDO online deposit"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || loadingPlans}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {submitting && <IconLoader className="h-4 w-4 animate-spin" />}
                  <span>Record & Generate Invoice</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
