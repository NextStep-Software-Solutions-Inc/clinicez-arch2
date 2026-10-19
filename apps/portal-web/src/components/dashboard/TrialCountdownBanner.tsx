"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useBillingInfo } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { 
    IconShieldCheck, 
    IconAlertCircle, 
    IconClock, 
    IconArrowRight, 
    IconLoader2,
    IconX 
} from "@tabler/icons-react";
import { triggerNavStart } from "./NavigationProgressBar";

interface TrialCountdownBannerProps {
    tenantSlug: string;
}

export default function TrialCountdownBanner({ tenantSlug }: TrialCountdownBannerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { billingInfo } = useBillingInfo(tenantSlug);
    const [dismissed, setDismissed] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);

    // Initialize dismissal from session storage
    useEffect(() => {
        if (typeof window !== "undefined") {
            const isDismissed = sessionStorage.getItem(`clinicez_trial_dismissed_${tenantSlug}`) === "true";
            if (isDismissed) {
                setDismissed(true);
            }
        }
    }, [tenantSlug]);

    // Reset navigating state once on billing page
    useEffect(() => {
        if (pathname?.includes("/dashboard/billing")) {
            setIsNavigating(false);
        }
    }, [pathname]);

    const handleDismiss = () => {
        setDismissed(true);
        if (typeof window !== "undefined") {
            sessionStorage.setItem(`clinicez_trial_dismissed_${tenantSlug}`, "true");
        }
    };

    const handleNavigateToBilling = () => {
        if (pathname === `/${tenantSlug}/dashboard/billing`) {
            // Already on billing page, smoothly scroll to plans
            const el = document.getElementById("billing-plans-section");
            if (el) {
                el.scrollIntoView({ behavior: "smooth" });
            }
            return;
        }

        setIsNavigating(true);
        triggerNavStart();
        router.push(`/${tenantSlug}/dashboard/billing`);
    };

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
            <div className="relative w-full bg-rose-500/10 border-b border-rose-500/20 px-4 py-3 sm:px-6 text-rose-950 dark:text-rose-100 animate-in fade-in duration-300">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-1 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
                            <IconAlertCircle className="h-4 w-4" />
                        </div>
                        <div className="leading-relaxed">
                            <span className="inline-flex items-center font-bold uppercase tracking-wider text-[10px] bg-rose-500/20 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full mr-2 shrink-0">
                                Trial Expired
                            </span>
                            <span className="font-semibold">
                                Your 14-day free trial has expired. Resource allocations are locked until a subscription plan is selected.
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center pl-7 sm:pl-0 shrink-0">
                        <Button 
                            size="sm" 
                            onClick={handleNavigateToBilling}
                            disabled={isNavigating}
                            className="rounded-xl font-bold text-xs h-7 px-3.5 bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5 transition-all"
                        >
                            {isNavigating ? (
                                <>
                                    <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Redirecting...</span>
                                </>
                            ) : (
                                <>
                                    <span>Upgrade to Active Plan</span>
                                    <IconArrowRight className="h-3.5 w-3.5" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // State 2: Trial ending soon (<= 3 days remaining)
    if (diffDays <= 3) {
        return (
            <div className="relative w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 sm:px-6 text-amber-950 dark:text-amber-100 animate-in fade-in duration-300">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pr-7 sm:pr-8">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                            <IconClock className="h-4 w-4 animate-pulse" />
                        </div>
                        <div className="leading-relaxed">
                            <span className="inline-flex items-center font-bold uppercase tracking-wider text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full mr-2 shrink-0">
                                Trial Ending Soon
                            </span>
                            <span className="font-semibold">
                                Your 14-day Starter trial expires in <span className="font-extrabold underline">{diffDays} day{diffDays === 1 ? "" : "s"}</span>. Upgrade now to ensure uninterrupted clinical operations.
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center pl-7 sm:pl-0 shrink-0">
                        <Button 
                            size="sm" 
                            onClick={handleNavigateToBilling}
                            disabled={isNavigating}
                            className="rounded-xl font-bold text-xs h-7 px-3.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 transition-all"
                        >
                            {isNavigating ? (
                                <>
                                    <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Redirecting...</span>
                                </>
                            ) : (
                                <>
                                    <span>Upgrade Subscription</span>
                                    <IconArrowRight className="h-3.5 w-3.5" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                <button 
                    onClick={handleDismiss} 
                    className="absolute top-2.5 right-3 text-amber-600 hover:text-amber-800 dark:hover:text-amber-300 p-1 rounded-lg hover:bg-amber-500/15 transition-colors"
                    title="Dismiss banner"
                >
                    <IconX className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }

    // State 3: Active evaluation period (> 3 days remaining)
    return (
        <div className="relative w-full bg-blue-500/10 border-b border-blue-500/20 px-4 py-3 sm:px-6 text-blue-950 dark:text-blue-100 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pr-7 sm:pr-8">
                <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                        <IconShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="leading-relaxed">
                        <span className="inline-flex items-center font-bold uppercase tracking-wider text-[10px] bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full mr-2 shrink-0">
                            14-Day Free Trial
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                            You are evaluating the Starter Plan (<span className="font-bold">{diffDays} days remaining</span>). Full access to clinic branches, staff seats, and patient files is unlocked.
                        </span>
                    </div>
                </div>

                <div className="flex items-center pl-7 sm:pl-0 shrink-0">
                    <Button 
                        size="sm" 
                        variant="outline"
                        onClick={handleNavigateToBilling}
                        disabled={isNavigating}
                        className="rounded-xl font-bold text-xs h-7 px-3.5 bg-white/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100/80 dark:hover:bg-blue-900/60 shadow-xs flex items-center gap-1.5 transition-all"
                    >
                        {isNavigating ? (
                            <>
                                <IconLoader2 className="h-3 w-3 animate-spin" />
                                <span>Loading...</span>
                            </>
                        ) : (
                            <>
                                <span>Upgrade Plan</span>
                                <IconArrowRight className="h-3 w-3" />
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <button 
                onClick={handleDismiss} 
                className="absolute top-2.5 right-3 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 p-1 rounded-lg hover:bg-blue-500/15 transition-colors"
                title="Dismiss banner"
            >
                <IconX className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
