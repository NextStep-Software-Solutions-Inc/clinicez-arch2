"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { usePlans } from "@/hooks/useBilling";
import { salesContactHref } from "@/config/site";

export function PricingClient({ 
  onAction, 
  loadingTier 
}: { 
  onAction?: (tierName: string) => void;
  loadingTier?: string | null;
} = {}) {
  const [isAnnual, setIsAnnual] = useState(true);
  const { plans: tiers, isLoading: isLoadingPlans } = usePlans();

  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[40%] rounded-full bg-primary/10 blur-[120px] pointer-events-none -z-10" />

      <section className="pt-32 pb-16 px-6 lg:px-8 w-full max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6">
            Simple, transparent pricing.
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            No hidden fees. No surprise charges. Just powerful software to run your healthcare business.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-16">
            <span className={`text-sm font-semibold ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
            <button 
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-8 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/20 transition-colors focus:outline-none"
            >
              <span className="sr-only">Toggle billing period</span>
              <span 
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-primary shadow transition-transform ${isAnnual ? 'translate-x-4' : '-translate-x-4'}`} 
              />
            </button>
            <span className={`text-sm font-semibold ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Annually <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Save 20%</span>
            </span>
          </div>
        </div>

        {/* Pricing Cards */}
        {isLoadingPlans ? (
          <div className="flex justify-center py-20">Loading plans...</div>
        ) : (
        <div className="grid md:grid-cols-3 gap-8 text-left">
          {tiers.map((tier, index) => (
            <div 
              key={index}
              className={`relative flex flex-col rounded-3xl border p-8 shadow-sm transition-all ${
                tier.highlighted 
                  ? 'border-primary bg-primary/5 shadow-primary/10 scale-105 z-10' 
                  : 'border-border bg-card'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-0 right-0 mx-auto w-fit rounded-full bg-primary px-4 py-1 text-xs font-bold text-primary-foreground">
                  Most Popular
                </div>
              )}
              
              <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
              <p className="text-muted-foreground text-sm mb-6 h-10">{tier.description}</p>
              
              <div className="mb-8">
                {typeof tier.priceMonthly === 'number' ? (
                  <div className="flex flex-wrap items-baseline text-4xl md:text-3xl lg:text-4xl xl:text-5xl font-extrabold">
                    ₱{Number(isAnnual ? tier.priceAnnually : tier.priceMonthly).toLocaleString()}
                    <span className="ml-1 text-base md:text-sm lg:text-base xl:text-xl font-medium text-muted-foreground">/mo</span>
                  </div>
                ) : (
                  <div className="text-4xl font-extrabold">{tier.priceMonthly}</div>
                )}
              </div>

              <ul className="space-y-4 mb-8 flex-grow">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <CheckCircle2 className="h-5 w-5 text-primary mr-3 shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <button 
                onClick={() => {
                  if (tier.requiresCheckout && onAction) {
                    onAction(tier.id);
                  } else if (tier.id === "enterprise") {
                    window.location.href = salesContactHref();
                  }
                }}
                disabled={loadingTier === tier.id || (!tier.requiresCheckout && tier.id !== "enterprise" && !onAction)}
                className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition-colors ${
                  tier.highlighted 
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                } ${loadingTier === tier.id ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {loadingTier === tier.id 
                  ? 'Loading...' 
                  : tier.requiresCheckout && onAction
                    ? `Subscribe to ${tier.name}` 
                    : tier.id === 'enterprise' ? 'Contact Sales' : 'Get Started'}
              </button>
            </div>
          ))}
        </div>
        )}
      </section>
    </main>
  );
}
