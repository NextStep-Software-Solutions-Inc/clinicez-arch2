import React from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { BillingPlan, BillingInfo } from "@/services/billing.service"
import { salesContactHref } from "@/config/site";

interface PricingPlansSectionProps {
  tiers: BillingPlan[]
  isAnnual: boolean
  setIsAnnual: (val: boolean) => void
  isSubscribed: boolean
  isSubscribedAnnual: boolean
  billingInfo: BillingInfo | null
  isLoading: string | null
  handlePlanClick: (tierId: string) => void
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
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              !isAnnual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button 
            type="button"
            onClick={() => setIsAnnual(true)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
              isAnnual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Annually
            <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {tiers.map((tier) => {
          const normalizedPlanId = tier.id === "professional" ? "pro" : tier.id
          const isCurrentPlan = isSubscribed && 
            billingInfo?.subscriptionPlanId?.toLowerCase() === normalizedPlanId && 
            isSubscribedAnnual === isAnnual

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
                {typeof tier.priceMonthly === 'number' ? (
                  <div className="flex items-baseline text-4xl font-extrabold">
                    ₱{Number(isAnnual ? tier.priceAnnually : tier.priceMonthly).toLocaleString()}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">/mo</span>
                  </div>
                ) : (
                  <div className="text-3xl font-extrabold">{tier.priceMonthly}</div>
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
                    handlePlanClick(tier.id)
                  } else if (tier.id === "enterprise") {
                    window.location.href = salesContactHref()
                  }
                }}
                disabled={isCurrentPlan || isLoading === tier.id || (!tier.requiresCheckout && tier.id !== "enterprise")}
                className={`w-full rounded-full py-2.5 text-xs font-semibold transition-all ${
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
                  'Active Plan'
                ) : tier.requiresCheckout ? (
                  isSubscribed ? (
                    'Switch to this Plan'
                  ) : (
                    `Subscribe to ${tier.name}` 
                  )
                ) : tier.id === 'enterprise' ? 'Contact Sales' : 'Get Started'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
