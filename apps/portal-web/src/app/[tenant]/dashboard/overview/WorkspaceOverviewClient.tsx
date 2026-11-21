"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBillingInfo } from "@/hooks/useBilling";
import { apiClient } from "@/transport/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    IconBuildingHospital,
    IconUsers,
    IconStethoscope,
    IconShieldCheck,
    IconAlertTriangle,
    IconPlus,
    IconArrowRight,
    IconExternalLink,
    IconCircleCheck,
    IconClockPlay,
    IconAlertCircle,
    IconCreditCard,
    IconSettings,
    IconFlask,
    IconPill,
    IconBuildingSkyscraper
} from "@tabler/icons-react";
import { getConsoleBaseDomain } from "@/utils/domain";
import { APP_SUBDOMAINS } from "@/config/site";

interface Facility {
    id: string;
    name: string;
    facilityType: "Clinic" | "Laboratory" | "Pharmacy" | "Organization";
    status: "Provisioning" | "Active" | "Suspended" | "Failed";
    createdAt: string;
    slug?: string;
    consoleUrl?: string;
}

const DASHBOARD_PORTS: Record<string, number> = {
    Clinic: 8081,
    Laboratory: 8082,
    Pharmacy: 8083,
    Organization: 8084
};

export default function WorkspaceOverviewClient({ tenantSlug }: { tenantSlug: string }) {
    const router = useRouter();
    const { billingInfo } = useBillingInfo(tenantSlug);
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loadingFacilities, setLoadingFacilities] = useState(true);

    const isSubscribed = 
        billingInfo?.subscriptionStatus === "ACTIVE" || 
        (billingInfo?.subscriptionStatus === "CANCELLED" && 
         !!billingInfo.subscriptionExpiresAt && 
         new Date(billingInfo.subscriptionExpiresAt) > new Date());
    
    const isTrialing = billingInfo?.subscriptionStatus === "TRIALING";
    const hasAllocations = (isSubscribed || isTrialing) && !!billingInfo?.planLimits;
    const trialDays = billingInfo?.trialDays ?? billingInfo?.paymentConfig?.trialDays;

    const planLimits = billingInfo?.planLimits;
    const usage = billingInfo?.usage;

    const fetchFacilities = async () => {
        try {
            const res = await apiClient.get<Facility[]>(`/facilities?tenantSlug=${tenantSlug}`);
            setFacilities(res.data || []);
        } catch (err) {
            console.error("Failed to load facilities", err);
        } finally {
            setLoadingFacilities(false);
        }
    };

    useEffect(() => {
        fetchFacilities();
        const interval = setInterval(fetchFacilities, 6000);
        return () => clearInterval(interval);
    }, [tenantSlug]);

    const clinics = facilities.filter(f => f.facilityType === "Clinic");
    const labs = facilities.filter(f => f.facilityType === "Laboratory");
    const pharmacies = facilities.filter(f => f.facilityType === "Pharmacy");

    const maxClinics = planLimits?.maxClinics ?? 0;
    const maxStaff = planLimits?.maxStaff ?? 0;
    const maxPatients = planLimits?.maxPatients ?? 0;
    const maxApi = planLimits?.monthlyApiQuotaLimit ?? 10000;

    const clinicPercent = maxClinics > 0 && maxClinics < 9999 ? Math.min(100, Math.round((clinics.length / maxClinics) * 100)) : 0;
    const staffPercent = maxStaff > 0 && maxStaff < 9999 ? Math.min(100, Math.round(((usage?.staffAccountsCount ?? 1) / maxStaff) * 100)) : 0;
    const patientPercent = maxPatients > 0 && maxPatients < 999999 ? Math.min(100, Math.round(((usage?.activePatientRecordsCount ?? 0) / maxPatients) * 100)) : 0;
    const apiPercent = maxApi > 0 && maxApi < 1000000 ? Math.min(100, Math.round(((usage?.monthlyApiQuotaUsed ?? 0) / maxApi) * 100)) : 0;

    const handleOpenConsole = (facility: Facility) => {
        if (facility.status !== "Active") return;

        if (facility.consoleUrl) {
            window.open(facility.consoleUrl, "_blank");
            return;
        }

        if (typeof window === "undefined") return;

        const baseDomain = getConsoleBaseDomain();
        if (baseDomain) {
            const sub = APP_SUBDOMAINS[facility.facilityType] || "clinic";
            const targetSlug = facility.slug || tenantSlug;
            window.open(`https://${targetSlug}.${sub}.${baseDomain}`, "_blank");
            return;
        }

        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isLocal) {
            const port = DASHBOARD_PORTS[facility.facilityType] || 8081;
            window.open(`http://localhost:${port}?tenant=${tenantSlug}`, "_blank");
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-in fade-in-50 duration-300">
            {/* Header Greeting & Quick CTAs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                            {billingInfo?.name || billingInfo?.clinicName || "Workspace Overview"}
                        </h1>
                        {hasAllocations ? (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-semibold px-2.5 py-0.5 text-[11px]">
                                {planLimits?.planTitle || "Active Plan"}
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60 font-semibold px-2.5 py-0.5 text-[11px]">
                                Setup Mode
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                        Real-time clinical operations, resource allocation telemetry, and facility management.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <Button 
                        onClick={() => router.push("?create=clinic")}
                        className="rounded-xl font-bold text-xs px-4 h-9 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center gap-1.5"
                    >
                        <IconPlus className="h-4 w-4" />
                        Create Clinic
                    </Button>
                    <Link href={`/${tenantSlug}/dashboard/billing`}>
                        <Button 
                            variant="outline" 
                            className="rounded-xl font-bold text-xs px-4 h-9 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1.5"
                        >
                            <IconCreditCard className="h-4 w-4" />
                            Billing & Plans
                        </Button>
                    </Link>
                    <Link href={`/${tenantSlug}/dashboard/settings`}>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800"
                            title="Workspace Settings"
                        >
                            <IconSettings className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>

            {/* 1. TOP METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Facilities Card */}
                <Card className="rounded-2xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 p-5">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Clinical Branches</div>
                        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                            <IconBuildingHospital className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-2">
                        {clinics.length} <span className="text-xs text-slate-400 font-semibold font-sans">/ {maxClinics >= 9999 ? "Unlimited" : maxClinics}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-2 flex items-center gap-1.5">
                        <span>{clinics.length} Clinic{clinics.length === 1 ? "" : "s"}</span>
                        <span>&bull;</span>
                        <span>{labs.length} Lab{labs.length === 1 ? "" : "s"}</span>
                        <span>&bull;</span>
                        <span>{pharmacies.length} Rx</span>
                    </div>
                </Card>

                {/* Staff Seats Card */}
                <Card className="rounded-2xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 p-5">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Staff Seats</div>
                        <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                            <IconUsers className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-2">
                        {usage?.staffAccountsCount ?? 1} <span className="text-xs text-slate-400 font-semibold font-sans">/ {maxStaff >= 9999 ? "Unlimited" : maxStaff}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-2">
                        {maxStaff >= 9999 
                            ? "Unlimited Staff Capacity" 
                            : `${Math.max(0, maxStaff - (usage?.staffAccountsCount ?? 1))} seat${Math.max(0, maxStaff - (usage?.staffAccountsCount ?? 1)) === 1 ? "" : "s"} available`
                        }
                    </div>
                </Card>

                {/* Patient Records Card */}
                <Card className="rounded-2xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 p-5">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Patients</div>
                        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                            <IconStethoscope className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-2">
                        {(usage?.activePatientRecordsCount ?? 0).toLocaleString()} <span className="text-xs text-slate-400 font-semibold font-sans">/ {maxPatients >= 999999 ? "Unlimited" : maxPatients.toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-2">
                        Enrolled Electronic Health Records
                    </div>
                </Card>

                {/* Subscription Status Card */}
                <Card className="rounded-2xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 p-5">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subscription Health</div>
                        <div className={`p-2 rounded-xl ${hasAllocations ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"}`}>
                            {hasAllocations ? <IconShieldCheck className="h-4 w-4" /> : <IconAlertTriangle className="h-4 w-4" />}
                        </div>
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-2 truncate">
                        {planLimits?.planTitle || (isTrialing ? (trialDays && trialDays > 0 ? `${trialDays}-Day Free Trial` : "Evaluation Period") : "Setup Mode")}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-2 flex items-center justify-between">
                        <span>{isSubscribed ? "Active Billing Cycle" : isTrialing ? "Evaluation Period" : "Plan Unsubscribed"}</span>
                        <Link href={`/${tenantSlug}/dashboard/billing`} className="text-primary hover:underline font-bold">
                            {hasAllocations ? "Manage" : "Subscribe"} &rarr;
                        </Link>
                    </div>
                </Card>
            </div>

            {/* 2. MIDDLE SECTION: ALLOCATION QUOTAS & QUICK ACCESS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Resource Allocation Gauges (2 cols on lg) */}
                <Card className="lg:col-span-2 rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                    <CardHeader className="p-6 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base sm:text-lg font-bold">Resource Allocation & Quota Utilization</CardTitle>
                                <CardDescription className="text-xs font-medium text-slate-500">
                                    Current workspace consumption against provisioned plan limits.
                                </CardDescription>
                            </div>
                            <Link href={`/${tenantSlug}/dashboard/settings?tab=limits`}>
                                <Button variant="ghost" size="sm" className="text-xs font-semibold text-primary hover:text-primary gap-1">
                                    View Details <IconArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-2 space-y-5">
                        {!hasAllocations ? (
                            <div className="flex flex-col sm:flex-row gap-4 items-start p-5 rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20">
                                <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 shrink-0">
                                    <IconAlertTriangle className="h-5 w-5" />
                                </div>
                                <div className="space-y-2 flex-1">
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Zero Provisioned Quotas (Setup Mode)</h4>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                        Your workspace is in setup mode. Subscribe to an active tier to unlock branch provisioning, staff accounts, and patient records.
                                    </p>
                                    <Link href={`/${tenantSlug}/dashboard/billing`}>
                                        <Button size="sm" className="rounded-xl font-semibold gap-1.5 text-xs h-8 shadow-sm mt-1">
                                            <IconCreditCard className="h-3.5 w-3.5" />
                                            Select Plan & Unlock Quotas
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Branch Capacity */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-slate-600 dark:text-slate-300">Clinical Branches</span>
                                        <span className="text-slate-900 dark:text-slate-100">
                                            {clinics.length} / {maxClinics >= 9999 ? "Unlimited" : maxClinics} ({maxClinics >= 9999 ? "100%" : `${clinicPercent}%`})
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-2 rounded-full transition-all duration-500 ${clinicPercent >= 100 ? "bg-rose-500" : clinicPercent >= 75 ? "bg-amber-500" : "bg-primary"}`} 
                                            style={{ width: `${maxClinics >= 9999 ? 15 : clinicPercent}%` }} 
                                        />
                                    </div>
                                </div>

                                {/* Staff Seats */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-slate-600 dark:text-slate-300">Staff Accounts</span>
                                        <span className="text-slate-900 dark:text-slate-100">
                                            {usage?.staffAccountsCount ?? 1} / {maxStaff >= 9999 ? "Unlimited" : maxStaff} ({maxStaff >= 9999 ? "100%" : `${staffPercent}%`})
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-2 rounded-full transition-all duration-500 ${staffPercent >= 100 ? "bg-rose-500" : staffPercent >= 75 ? "bg-amber-500" : "bg-purple-600"}`} 
                                            style={{ width: `${maxStaff >= 9999 ? 20 : staffPercent}%` }} 
                                        />
                                    </div>
                                </div>

                                {/* Patient Capacity */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-slate-600 dark:text-slate-300">Patient Records</span>
                                        <span className="text-slate-900 dark:text-slate-100">
                                            {(usage?.activePatientRecordsCount ?? 0).toLocaleString()} / {maxPatients >= 999999 ? "Unlimited" : maxPatients.toLocaleString()} ({maxPatients >= 999999 ? "100%" : `${patientPercent}%`})
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className="h-2 rounded-full bg-emerald-500 transition-all duration-500" 
                                            style={{ width: `${maxPatients >= 999999 ? 10 : patientPercent}%` }} 
                                        />
                                    </div>
                                </div>

                                {/* Monthly API Quota */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-slate-600 dark:text-slate-300">Monthly API Quota</span>
                                        <span className="text-slate-900 dark:text-slate-100">
                                            {usage?.monthlyApiQuotaUsed ?? 0} / {maxApi >= 1000000 ? "Unlimited" : `${(maxApi / 1000).toFixed(0)}k`} ({maxApi >= 1000000 ? "100%" : `${apiPercent}%`})
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className="h-2 rounded-full bg-blue-500 transition-all duration-500" 
                                            style={{ width: `${maxApi >= 1000000 ? 5 : apiPercent}%` }} 
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions Card (1 col on lg) */}
                <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 flex flex-col justify-between">
                    <CardHeader className="p-6 pb-3">
                        <CardTitle className="text-base sm:text-lg font-bold">Quick Provisioning</CardTitle>
                        <CardDescription className="text-xs font-medium text-slate-500">
                            Create clinical facilities and jumpstart workspace infrastructure.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-2.5">
                        <Button
                            onClick={() => router.push("?create=clinic")}
                            variant="outline"
                            className="w-full justify-between h-11 rounded-2xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60 text-xs font-semibold"
                        >
                            <div className="flex items-center gap-2">
                                <IconBuildingHospital className="h-4 w-4 text-primary" />
                                <span>Create Clinic Location</span>
                            </div>
                            <IconPlus className="h-3.5 w-3.5 text-slate-400" />
                        </Button>

                        <Button
                            onClick={() => router.push("?create=laboratory")}
                            variant="outline"
                            className="w-full justify-between h-11 rounded-2xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60 text-xs font-semibold"
                        >
                            <div className="flex items-center gap-2">
                                <IconFlask className="h-4 w-4 text-purple-600" />
                                <span>Create Laboratory</span>
                            </div>
                            <IconPlus className="h-3.5 w-3.5 text-slate-400" />
                        </Button>

                        <Button
                            onClick={() => router.push("?create=pharmacy")}
                            variant="outline"
                            className="w-full justify-between h-11 rounded-2xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60 text-xs font-semibold"
                        >
                            <div className="flex items-center gap-2">
                                <IconPill className="h-4 w-4 text-emerald-600" />
                                <span>Create Pharmacy</span>
                            </div>
                            <IconPlus className="h-3.5 w-3.5 text-slate-400" />
                        </Button>

                        <Link href={`/${tenantSlug}/dashboard/team`} className="block">
                            <Button
                                variant="outline"
                                className="w-full justify-between h-11 rounded-2xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60 text-xs font-semibold"
                            >
                                <div className="flex items-center gap-2">
                                    <IconUsers className="h-4 w-4 text-purple-600" />
                                    <span>Manage Workspace Team</span>
                                </div>
                                <IconArrowRight className="h-3.5 w-3.5 text-slate-400" />
                            </Button>
                        </Link>

                        <Link href={`/${tenantSlug}/dashboard/billing?tab=plans`} className="block pt-1">
                            <Button
                                variant="outline"
                                className="w-full justify-between h-11 rounded-2xl border-blue-200 dark:border-blue-900/50 bg-blue-50/20 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 hover:bg-blue-50/50 text-xs font-semibold"
                            >
                                <div className="flex items-center gap-2">
                                    <IconCreditCard className="h-4 w-4" />
                                    <span>Upgrade Subscription</span>
                                </div>
                                <IconArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>

            {/* 3. PROVISIONED FACILITIES & CONSOLE ACCESS TABLE */}
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 overflow-hidden">
                <CardHeader className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-base sm:text-lg font-bold">Institutional Facilities</CardTitle>
                            <CardDescription className="text-xs font-medium text-slate-500 mt-0.5">
                                Live operational status and console access for all provisioned facilities.
                            </CardDescription>
                        </div>
                        <div className="text-xs font-semibold text-slate-400">
                            {facilities.length} Total Registered
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {loadingFacilities ? (
                        <div className="p-6 space-y-3">
                            {[1, 2, 3].map((n) => (
                                <div key={n} className="h-12 w-full rounded-xl bg-slate-50 dark:bg-slate-900 animate-pulse" />
                            ))}
                        </div>
                    ) : facilities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center">
                            <div className="p-4 bg-primary/10 rounded-full text-primary mb-3">
                                <IconBuildingHospital className="h-8 w-8" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">No Facilities Provisioned Yet</h3>
                            <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                                You haven&apos;t created any clinic locations, labs, or pharmacies for this workspace. Create your first facility to launch operations.
                            </p>
                            <Button
                                onClick={() => router.push("?create=clinic")}
                                className="mt-4 rounded-xl font-bold text-xs px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/95"
                            >
                                <IconPlus className="h-4 w-4 mr-1.5" />
                                Create Clinic Location
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* Mobile Facilities View (< md) */}
                            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-3 sm:p-4 space-y-3">
                                {facilities.map((fac) => (
                                    <div key={fac.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                                                    {fac.name}
                                                </div>
                                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                    {fac.facilityType === "Clinic" && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
                                                            <IconBuildingHospital className="h-3 w-3" /> Clinic
                                                        </span>
                                                    )}
                                                    {fac.facilityType === "Laboratory" && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60">
                                                            <IconFlask className="h-3 w-3" /> Laboratory
                                                        </span>
                                                    )}
                                                    {fac.facilityType === "Pharmacy" && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                                                            <IconPill className="h-3 w-3" /> Pharmacy
                                                        </span>
                                                    )}
                                                    {fac.facilityType === "Organization" && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                                                            <IconBuildingSkyscraper className="h-3 w-3" /> Organization
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="shrink-0">
                                                {fac.status === "Provisioning" && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 animate-pulse border border-amber-100 dark:border-amber-900/30">
                                                        <IconClockPlay className="h-3 w-3" />
                                                        Provisioning
                                                    </span>
                                                )}
                                                {fac.status === "Active" && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                                                        <IconCircleCheck className="h-3 w-3" />
                                                        Active
                                                    </span>
                                                )}
                                                {fac.status === "Failed" && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30">
                                                        <IconAlertCircle className="h-3 w-3" />
                                                        Failed
                                                    </span>
                                                )}
                                                {fac.status === "Suspended" && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                                        <IconAlertCircle className="h-3 w-3" />
                                                        Suspended
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-slate-500 pt-1.5 border-t border-slate-100 dark:border-slate-800/60">
                                            <span className="text-[10px] uppercase font-bold text-slate-400">Registered</span>
                                            <span className="font-medium text-slate-600 dark:text-slate-300">
                                                {new Date(fac.createdAt).toLocaleDateString("en-US", {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric"
                                                })}
                                            </span>
                                        </div>

                                        <Button
                                            onClick={() => handleOpenConsole(fac)}
                                            disabled={fac.status !== "Active"}
                                            variant="outline"
                                            size="sm"
                                            className="w-full rounded-xl text-xs font-bold h-9 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center justify-center gap-1.5"
                                        >
                                            {fac.status === "Provisioning" ? (
                                                <>
                                                    <IconClockPlay className="h-3.5 w-3.5 animate-spin text-amber-500" />
                                                    <span>Provisioning...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>Launch Console</span>
                                                    <IconExternalLink className="h-3.5 w-3.5" />
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop Facilities Table (>= md) */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full min-w-[640px] text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                            <th className="px-6 py-3.5 whitespace-nowrap">Facility Name</th>
                                            <th className="px-6 py-3.5 whitespace-nowrap">Type</th>
                                            <th className="px-6 py-3.5 whitespace-nowrap">Operational Status</th>
                                            <th className="px-6 py-3.5 whitespace-nowrap">Created Date</th>
                                            <th className="px-6 py-3.5 text-right whitespace-nowrap">Console Access</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                        {facilities.map((fac) => (
                                            <tr key={fac.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-100">
                                                    {fac.name}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {fac.facilityType === "Clinic" && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
                                                            <IconBuildingHospital className="h-3 w-3" /> Clinic
                                                        </span>
                                                    )}
                                                    {fac.facilityType === "Laboratory" && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60">
                                                            <IconFlask className="h-3 w-3" /> Laboratory
                                                        </span>
                                                    )}
                                                    {fac.facilityType === "Pharmacy" && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                                                            <IconPill className="h-3 w-3" /> Pharmacy
                                                        </span>
                                                    )}
                                                    {fac.facilityType === "Organization" && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                                                            <IconBuildingSkyscraper className="h-3 w-3" /> Organization
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {fac.status === "Provisioning" && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 animate-pulse border border-amber-100 dark:border-amber-900/30">
                                                            <IconClockPlay className="h-3 w-3" />
                                                            Provisioning
                                                        </span>
                                                    )}
                                                    {fac.status === "Active" && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                                                            <IconCircleCheck className="h-3 w-3" />
                                                            Active
                                                        </span>
                                                    )}
                                                    {fac.status === "Failed" && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30">
                                                            <IconAlertCircle className="h-3 w-3" />
                                                            Failed
                                                        </span>
                                                    )}
                                                    {fac.status === "Suspended" && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                                            <IconAlertCircle className="h-3 w-3" />
                                                            Suspended
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap">
                                                    {new Date(fac.createdAt).toLocaleDateString("en-US", {
                                                        year: "numeric",
                                                        month: "short",
                                                        day: "numeric"
                                                    })}
                                                </td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <Button
                                                        onClick={() => handleOpenConsole(fac)}
                                                        disabled={fac.status !== "Active"}
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-xl text-xs font-bold h-8 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                                    >
                                                        {fac.status === "Provisioning" ? (
                                                            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                                                <IconClockPlay className="h-3.5 w-3.5 animate-spin" />
                                                                Provisioning...
                                                            </span>
                                                        ) : (
                                                            <>
                                                                Launch Console
                                                                <IconExternalLink className="h-3.5 w-3.5 ml-1.5" />
                                                            </>
                                                        )}
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
