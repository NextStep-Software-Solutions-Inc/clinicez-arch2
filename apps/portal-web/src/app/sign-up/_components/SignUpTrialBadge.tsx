"use client";

import { Sparkles } from "lucide-react";
import { usePaymentConfig } from "@/hooks/useBilling";

export function SignUpTrialBadge() {
  const { paymentConfig } = usePaymentConfig();
  const trialDays = paymentConfig?.trialDays ?? 14;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary mb-6 w-fit backdrop-blur-md">
      <Sparkles className="h-3.5 w-3.5" />
      {trialDays}-Day Free Trial
    </div>
  );
}
