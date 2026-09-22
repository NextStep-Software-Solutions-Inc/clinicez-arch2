"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useBillingInfo } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { 
    IconShieldCheck, 
    IconAlertCircle, 
    IconClock, 
    IconArrowRight, 
    IconX 
} from "@tabler/icons-react";

interface TrialCountdownBannerProps {
    tenantSlug: string;
}

export default function TrialCountdownBanner({ tenantSlug }: TrialCountdownBannerProps) {
    const { billingInfo } = useBillingInfo(tenantSlug);
    const [dismissed, setDismissed] = useState(false);

    const subscriptionStatus = billingInfo?.subscriptionStatus;
    const isTrialing = subscriptionStatus === "TRIALING";
    const isExpired = subscriptionStatus === "EXPIRED";

    // Only render for active trials or expired states
    if ((!isTrialing && !isExpired) || dismissed) {
        return null;
    }

    const expiresAt = billingInfo?.subscriptionExpiresAt 
        ? new Date(billingInfo.subscriptionExpiresAt) 
        : null;
    
    const now = new Date();
    const diffTime = expiresAt ? expiresAt.getTime() - now.getTime() : 0;
    const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // State 1: Trial has expired
    if (isExpired || (isTrialing && diffDays <= 0)) {
        return (
            <div className="w-full bg-rose-500/10 border-b border-rose-500/20 px-4 py-2.5 sm:px-6 text-rose-900 dark:text-rose-200 animate-in fade-in duration-300">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
                            <IconAlertCircle className="h-4 w-4" />
                        </div>
                        <p className="font-semibold">
                            <span className="font-bold uppercase tracking-wider text-[10px] bg-rose-500/20 px-2 py-0.5 rounded-full mr-2">
                                Trial Expired
                            </span>
                            Your 14-day free trial has expired. Resource allocations are locked until a subscription plan is selected.
                        </p>
                    </div>

                    <Link href={`/${tenantSlug}/dashboard/billing`} className="shrink-0">
                        <Button 
                            size="sm" 
                            className="rounded-xl font-bold text-xs h-7 px-3.5 bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5"
                        >
                            Upgrade to Active Plan
                            <IconArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    // State 2: Trial ending soon (<= 3 days remaining)
    if (diffDays <= 3) {
        return (
            <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 sm:px-6 text-amber-900 dark:text-amber-200 animate-in fade-in duration-300">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                            <IconClock className="h-4 w-4 animate-pulse" />
                        </div>
                        <p className="font-semibold">
                            <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full mr-2">
                                Trial Ending Soon
                            </span>
                            Your 14-day Starter trial expires in <span className="font-extrabold underline">{diffDays} day{diffDays === 1 ? "" : "s"}</span>. Upgrade now to ensure uninterrupted clinical operations.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/${tenantSlug}/dashboard/billing`}>
                            <Button 
                                size="sm" 
                                className="rounded-xl font-bold text-xs h-7 px-3.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5"
                            >
                                Upgrade Subscription
                                <IconArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // State 3: Active evaluation period (> 3 days remaining)
    return (
        <div className="w-full bg-blue-500/10 border-b border-blue-500/20 px-4 py-2.5 sm:px-6 text-blue-900 dark:text-blue-200 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0">
                        <IconShieldCheck className="h-4 w-4" />
                    </div>
                    <p className="font-medium">
                        <span className="font-bold uppercase tracking-wider text-[10px] bg-blue-500/20 px-2 py-0.5 rounded-full mr-2">
                            14-Day Free Trial
                        </span>
                        You are evaluating the Starter Plan (<span className="font-bold">{diffDays} days remaining</span>). Full access to clinic branches, staff seats, and patient files is unlocked.
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/${tenantSlug}/dashboard/billing`}>
                        <Button 
                            size="sm" 
                            variant="outline"
                            className="rounded-xl font-bold text-xs h-7 px-3 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 flex items-center gap-1"
                        >
                            Upgrade Plan
                            <IconArrowRight className="h-3 w-3" />
                        </Button>
                    </Link>
                    <button 
                        onClick={() => setDismissed(true)} 
                        className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 p-1 rounded-lg hover:bg-blue-500/10 transition-colors"
                        title="Dismiss banner"
                    >
                        <IconX className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
