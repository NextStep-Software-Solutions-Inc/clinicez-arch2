import { BillingPlan } from "@/services/billing.service";

export interface PlanPriceMetrics {
  isCustom: boolean;
  displayPrice: string;
  displayPeriod: string;
  cadenceNote: string;
  savingsBadge: string | null;
  discountPercent: number;
}

export function formatTierPricing(tier: BillingPlan, isAnnual: boolean): PlanPriceMetrics {
  const m =
    typeof tier.priceMonthly === "number"
      ? tier.priceMonthly
      : typeof tier.monthlyPrice === "number"
        ? tier.monthlyPrice
        : parseFloat(String(tier.priceMonthly || 0)) || 0;

  const a =
    typeof tier.priceAnnually === "number"
      ? tier.priceAnnually
      : typeof tier.annualPrice === "number"
        ? tier.annualPrice
        : parseFloat(String(tier.priceAnnually || 0)) || 0;

  if (m <= 0 && a <= 0) {
    return {
      isCustom: true,
      displayPrice: typeof tier.priceMonthly === "string" ? tier.priceMonthly : "Custom",
      displayPeriod: "",
      cadenceNote: "Tailored to your clinical infrastructure",
      savingsBadge: null,
      discountPercent: 0,
    };
  }

  let annualTotal = a;
  let effectiveMonthly = a;

  if (m > 0 && a > 0) {
    if (a > m * 2) {
      annualTotal = a;
      effectiveMonthly = Math.round(a / 12);
    } else {
      effectiveMonthly = a;
      annualTotal = a * 12;
    }
  }

  let discountPercent = 0;
  if (m > 0 && annualTotal > 0 && annualTotal < m * 12) {
    discountPercent = Math.round(((m * 12 - annualTotal) / (m * 12)) * 100);
  }

  const currentDisplayAmount = isAnnual ? effectiveMonthly : m;

  return {
    isCustom: false,
    displayPrice: `₱${currentDisplayAmount.toLocaleString()}`,
    displayPeriod: "/mo",
    cadenceNote: isAnnual
      ? `Billed annually at ₱${annualTotal.toLocaleString()}/yr`
      : "Billed monthly, cancel anytime",
    savingsBadge: isAnnual && discountPercent > 0 ? `Save ${discountPercent}%` : null,
    discountPercent,
  };
}
