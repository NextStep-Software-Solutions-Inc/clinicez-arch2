"use client";

import { Sparkles } from "lucide-react";
import { usePublicConfig } from "@/hooks/useBilling";
import { type BillingPublicConfig } from "@/services/billing.service";

interface SignUpTrialBadgeProps {
  initialConfig?: BillingPublicConfig | null;
}

export function SignUpTrialBadge({ initialConfig }: SignUpTrialBadgeProps) {
  const { publicConfig, isLoading, isError } = usePublicConfig(initialConfig);

  const isPending = (isLoading || !publicConfig) && initialConfig === undefined;

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Loading trial details"
        className="h-7 w-36 animate-pulse rounded-full bg-muted mb-6"
      />
    );
  }

  const trialDays = publicConfig?.trialDays;
  if (trialDays === undefined || trialDays === null || trialDays <= 0 || isError) {
    return null;
  }

  return (
    <div
      data-testid="signup-trial-badge"
      className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary mb-6 w-fit backdrop-blur-md"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {`${trialDays}-Day Free Trial`}
    </div>
  );
}
