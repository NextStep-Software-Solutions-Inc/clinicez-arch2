"use client";

import React, { useMemo } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { BillingPlan, BillingInfo } from "@/services/billing.service";
import { salesContactHref } from "@/config/site";
import { formatTierPricing } from "@/app/(main)/pricing/_components/PricingClient";

interface PricingPlansSectionProps {
  tiers: BillingPlan[];
  isAnnual: boolean;
  setIsAnnual: (val: boolean) => void;
  isSubscribed: boolean;
  isSubscribedAnnual: boolean;
  billingInfo: BillingInfo | null;
  isLoading: string | null;
  handlePlanClick: (tierId: string) => void;
}

export default function PricingPlansSection({
  tiers,
  isAnnual,
  setIsAnnual,
  isSubscribed,
  isSubscribedAnnual,
  billingInfo,
  isLoading,
  handlePlanClick,
}: PricingPlansSectionProps) {
  // Compute highest discount dynamically across available tiers
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
    if (tiers.length === 1) return "max-w-md mx-auto grid grid-cols-1 gap-8";
    if (tiers.length === 2) return "max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8";
    if (tiers.length === 4) return "w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6";
    if (tiers.length >= 5) return "w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";
    return "grid md:grid-cols-3 gap-8";
  }, [tiers.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t pt-6">
        <div>
          <h2 className="text-xl font-bold">Select a Subscription Plan</h2>
          <p className="text-muted-foreground text-sm">Choose the best billing cycle for your practice.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-muted/40 p-1.5 rounded-full border w-fit">
          <button 
            type="button"
            onClick={() => setIsAnnual(false)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              !isAnnual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button 
            type="button"
            onClick={() => setIsAnnual(true)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              isAnnual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Annually
            {maxDiscount > 0 && (
              <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                Save {maxDiscount}%
              </span>
            )}
          </button>
        </div>
      </div>

      <div className={gridContainerClass}>
        {tiers.map((tier) => {
          const normalizedPlanId = tier.id === "professional" ? "pro" : tier.id;
          const isCurrentPlan = isSubscribed && 
            billingInfo?.subscriptionPlanId?.toLowerCase() === normalizedPlanId && 
            isSubscribedAnnual === isAnnual;

          const pricing = formatTierPricing(tier, isAnnual);

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
                {pricing.isCustom ? (
                  <div>
                    <div className="text-3xl font-extrabold">{pricing.displayPrice}</div>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">{pricing.cadenceNote}</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline text-4xl font-extrabold">
                      {pricing.displayPrice}
                      <span className="ml-1 text-sm font-medium text-muted-foreground">{pricing.displayPeriod}</span>
                      {pricing.savingsBadge && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                          {pricing.savingsBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">{pricing.cadenceNote}</p>
                  </div>
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
                type="button"
                onClick={() => {
                  if (tier.requiresCheckout) {
                    handlePlanClick(tier.id);
                  } else if (tier.id === "enterprise" || tier.slug === "enterprise") {
                    window.location.href = salesContactHref();
                  }
                }}
                disabled={isCurrentPlan || isLoading === tier.id || (!tier.requiresCheckout && tier.id !== "enterprise" && tier.slug !== "enterprise")}
                className={`w-full rounded-full py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  isCurrentPlan
                    ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 cursor-not-allowed'
                    : tier.highlighted 
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                } ${isLoading === tier.id ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLoading === tier.id ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Processing...</span>
                  </span>
                ) : isCurrentPlan ? (
                  "Active on This Workspace"
                ) : tier.requiresCheckout ? (
                  isSubscribed ? `Switch to ${tier.name}` : `Subscribe to ${tier.name}`
                ) : tier.id === "enterprise" || tier.slug === "enterprise" ? (
                  "Contact Sales"
                ) : (
                  "Included with Workspace"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
