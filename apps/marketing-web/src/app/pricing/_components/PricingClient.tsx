"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { usePlans, usePublicConfig } from "@/hooks/useBilling";
import { BillingPlan, BillingPublicConfig } from "@/services/billing.service";
import { getPortalAppUrl } from "@/utils/urls";

export interface PlanPriceMetrics {
  isCustom: boolean;
  displayPrice: string;
  displayPeriod: string;
  cadenceNote: string;
  savingsBadge: string | null;
  discountPercent: number;
}

export function isEnterprisePlan(
  plan: Pick<BillingPlan, "id" | "slug"> & { key?: string }
): boolean {
  const candidates = [plan.key, plan.slug, plan.id].map((v) =>
    (v || "").trim().toLowerCase()
  );
  return candidates.includes("enterprise");
}

export function buildPlanSelectionHref(
  plan: Pick<BillingPlan, "id" | "slug"> & { key?: string },
  isAnnual: boolean,
  hostname?: string
): string {
  if (isEnterprisePlan(plan)) {
    return "/contact-us";
  }

  const planKey = plan.key || plan.slug || plan.id;
  const billingCycle = isAnnual ? "annual" : "monthly";
  const redirectPath = `/tenants/register?plan=${encodeURIComponent(planKey)}&billing=${encodeURIComponent(billingCycle)}`;

  return getPortalAppUrl(
    "/sign-up",
    {
      plan: planKey,
      billing: billingCycle,
      redirect_url: redirectPath,
    },
    hostname
  );
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

export function PricingClient({
  initialPlans,
  initialPublicConfig,
  onAction,
  loadingTier,
}: {
  initialPlans?: BillingPlan[];
  initialPublicConfig?: BillingPublicConfig | null;
  onAction?: (tierName: string) => void;
  loadingTier?: string | null;
} = {}) {
  const { publicConfig } = usePublicConfig(initialPublicConfig);
  const [manualIsAnnual, setManualIsAnnual] = useState<boolean | null>(null);
  const defaultCadence =
    publicConfig?.defaultBillingCadence ?? initialPublicConfig?.defaultBillingCadence;
  const isAnnual =
    manualIsAnnual !== null
      ? manualIsAnnual
      : defaultCadence?.toLowerCase() === "annually";
  const { plans: tiers, isLoading: isLoadingPlans } = usePlans(initialPlans);

  const maxDiscount = useMemo(() => {
    let max = 0;
    for (const tier of tiers) {
      const metrics = formatTierPricing(tier, true);
      if (metrics.discountPercent > max) {
        max = metrics.discountPercent;
      }
    }
    return max;
  }, [tiers]);

  const gridContainerClass = useMemo(() => {
    if (tiers.length === 1) {
      return "max-w-md mx-auto grid grid-cols-1 gap-8";
    }
    if (tiers.length === 2) {
      return "max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8";
    }
    if (tiers.length === 4) {
      return "w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6";
    }
    if (tiers.length >= 5) {
      return "w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";
    }
    return "max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8";
  }, [tiers.length]);

  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[40%] rounded-full bg-primary/10 blur-[120px] pointer-events-none -z-10" />

      <section className="pt-28 sm:pt-32 pb-20 px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6">
            Simple, transparent pricing.
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            No hidden fees. No surprise charges. Just powerful software to run your healthcare business.
          </p>

          {/* Billing Cadence Toggle */}
          <div className="flex items-center justify-center gap-3.5 mb-14">
            <span
              className={`text-sm font-semibold transition-colors ${
                !isAnnual ? "text-foreground font-bold" : "text-muted-foreground"
              }`}
            >
              Monthly
            </span>
            <button
              type="button"
              onClick={() => {
                setManualIsAnnual(!isAnnual);
              }}
              className="relative inline-flex h-8 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/20 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Toggle annual or monthly billing"
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-primary shadow-md transition-transform duration-200 ${
                  isAnnual ? "translate-x-4" : "-translate-x-4"
                }`}
              />
            </button>
            <span
              className={`text-sm font-semibold transition-colors flex items-center gap-2 ${
                isAnnual ? "text-foreground font-bold" : "text-muted-foreground"
              }`}
            >
              Annually
              {maxDiscount > 0 && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 animate-in fade-in duration-200">
                  Save {maxDiscount}%
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Pricing Cards Container */}
        {isLoadingPlans ? (
          <div className="flex justify-center items-center py-24 text-muted-foreground text-sm font-medium">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mr-3" />
            Loading subscription plans...
          </div>
        ) : tiers.length === 0 ? (
          <div className="max-w-lg mx-auto rounded-3xl border border-dashed border-border bg-card p-10 text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">
              Custom Healthcare Workspace Plans
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Reach out to our team for tailored pricing across single clinics, laboratories, pharmacies, and multi-branch health networks.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <a
                href={getPortalAppUrl("/sign-up")}
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Start Free Trial
              </a>
              <Link
                href="/contact-us"
                className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        ) : (
          <div className={`${gridContainerClass} text-left items-stretch`}>
            {tiers.map((tier, index) => {
              const pricing = formatTierPricing(tier, isAnnual);
              const enterprise = isEnterprisePlan(tier);
              const ctaHref = buildPlanSelectionHref(tier, isAnnual);
              const ctaClasses = `w-full inline-flex items-center justify-center text-center rounded-2xl px-5 py-3 text-sm font-bold transition-all cursor-pointer shadow-xs ${
                tier.highlighted
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              } ${loadingTier === tier.id ? "opacity-70 cursor-not-allowed" : ""}`;
              const ctaLabel =
                loadingTier === tier.id
                  ? "Processing..."
                  : tier.requiresCheckout && onAction
                    ? `Subscribe to ${tier.name}`
                    : enterprise
                      ? "Contact Sales"
                      : "Get Started";

              return (
                <div
                  key={tier.id || index}
                  className={`relative flex flex-col rounded-3xl border p-7 sm:p-8 shadow-sm transition-all duration-200 ${
                    tier.highlighted
                      ? "border-primary bg-primary/5 shadow-primary/10 lg:-translate-y-2 z-10 ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-border/80"
                  }`}
                >
                  {tier.highlighted && (
                    <div className="absolute -top-3.5 left-0 right-0 mx-auto w-fit rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground shadow-xs">
                      Most Popular
                    </div>
                  )}

                  <h3 className="text-xl font-bold mb-1.5 text-foreground">{tier.name}</h3>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-6 min-h-[40px] leading-relaxed">
                    {tier.description}
                  </p>

                  {/* Pricing Display */}
                  <div className="mb-7">
                    {pricing.isCustom ? (
                      <div>
                        <div className="text-3xl sm:text-4xl font-extrabold text-foreground">
                          {pricing.displayPrice}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                          {pricing.cadenceNote}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap items-baseline text-4xl sm:text-3xl xl:text-4xl font-extrabold text-foreground tracking-tight">
                          {pricing.displayPrice}
                          <span className="ml-1 text-base font-medium text-muted-foreground">
                            {pricing.displayPeriod}
                          </span>
                          {pricing.savingsBadge && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                              {pricing.savingsBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                          {pricing.cadenceNote}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Features List */}
                  <ul className="space-y-3.5 mb-8 flex-grow">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start text-xs sm:text-sm">
                        <CheckCircle2 className="h-4.5 w-4.5 text-primary mr-2.5 shrink-0 mt-0.5" />
                        <span className="text-foreground leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Call to Action */}
                  {onAction ? (
                    <button
                      type="button"
                      onClick={() => onAction(tier.id)}
                      disabled={loadingTier === tier.id}
                      className={ctaClasses}
                    >
                      {ctaLabel}
                    </button>
                  ) : enterprise ? (
                    <Link href={ctaHref} className={ctaClasses}>
                      {ctaLabel}
                    </Link>
                  ) : (
                    <a href={ctaHref} className={ctaClasses}>
                      {ctaLabel}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
