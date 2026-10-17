"use client";

import { useState, useMemo, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { usePlans, usePaymentConfig } from "@/hooks/useBilling";
import { salesContactHref } from "@/config/site";
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
      discountPercent: 0
    };
  }

  // Detect whether `a` is total annual price (e.g. 32340 vs 2940) or monthly equivalent (e.g. 2340 vs 2940)
  let annualTotal = a;
  let effectiveMonthly = a;

  if (m > 0 && a > 0) {
    if (a > m * 2) {
      // `a` is the full yearly fee
      annualTotal = a;
      effectiveMonthly = Math.round(a / 12);
    } else {
      // `a` is already discounted monthly-equivalent
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
    discountPercent
  };
}

export function PricingClient({
  onAction,
  loadingTier
}: {
  onAction?: (tierName: string) => void;
  loadingTier?: string | null;
} = {}) {
  const { paymentConfig } = usePaymentConfig();
  const [isAnnual, setIsAnnual] = useState(false);
  const [userToggled, setUserToggled] = useState(false);
  const { isSignedIn } = useUser();
  const { plans: tiers, isLoading: isLoadingPlans } = usePlans();

  // Hydrate initial billing cadence from platform settings if not manually toggled by user
  useEffect(() => {
    if (!userToggled && paymentConfig?.defaultBillingCadence) {
      setIsAnnual(paymentConfig.defaultBillingCadence.toLowerCase() === "annually");
    }
  }, [paymentConfig?.defaultBillingCadence, userToggled]);

  // Compute highest discount dynamically across all available tiers
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

  // Responsive grid layout that accommodates 1, 2, 3, 4, or more plans elegantly
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
    // Default 3 tiers
    return "max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8";
  }, [tiers.length]);

  const handleGetStarted = (tier: BillingPlan) => {
    if (tier.requiresCheckout && onAction) {
      onAction(tier.id);
      return;
    }
    if (tier.id === "enterprise" || tier.slug === "enterprise") {
      window.location.href = salesContactHref();
      return;
    }
    if (onAction) {
      onAction(tier.id);
      return;
    }

    const planKey = encodeURIComponent(tier.slug || tier.id);
    const billingCycle = isAnnual ? "annual" : "monthly";
    const postAuthRedirect = `/tenants/register?plan=${planKey}&billing=${billingCycle}`;

    if (isSignedIn) {
      // If already logged in, navigate straight to workplace setup with pre-selected plan
      window.location.href = postAuthRedirect;
      return;
    }

    // Direct new user to Clerk sign-up with plan pre-seeded and destination back to workplace registration
    window.location.href = `/sign-up?plan=${planKey}&billing=${billingCycle}&redirect_url=${encodeURIComponent(
      postAuthRedirect
    )}`;
  };

  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
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
                setUserToggled(true);
                setIsAnnual(!isAnnual);
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
        ) : (
          <div className={`${gridContainerClass} text-left items-stretch`}>
            {tiers.map((tier, index) => {
              const pricing = formatTierPricing(tier, isAnnual);

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

                  {/* Call to Action Button */}
                  <button
                    type="button"
                    onClick={() => handleGetStarted(tier)}
                    disabled={loadingTier === tier.id}
                    className={`w-full rounded-2xl px-5 py-3 text-sm font-bold transition-all cursor-pointer shadow-xs ${
                      tier.highlighted
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    } ${loadingTier === tier.id ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    {loadingTier === tier.id
                      ? "Processing..."
                      : tier.requiresCheckout && onAction
                      ? `Subscribe to ${tier.name}`
                      : tier.id === "enterprise" || tier.slug === "enterprise"
                      ? "Contact Sales"
                      : "Get Started"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
