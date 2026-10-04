"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useBillingInfo } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { 
    IconSettings, 
    IconUser, 
    IconLayersIntersect, 
    IconInfoCircle, 
    IconDeviceFloppy,
    IconAlertTriangle,
    IconCreditCard,
    IconArrowRight,
    IconPalette,
    IconFileText,
    IconCheck
} from "@tabler/icons-react";
import { toast } from "sonner";
import { tenantService } from "@/services/tenant.service";

export default function SettingsPage() {
    const params = useParams();
    const tenantSlug = params?.tenant as string;
    const { billingInfo, mutate } = useBillingInfo(tenantSlug);

    const isSubscribed = 
        billingInfo?.subscriptionStatus === "ACTIVE" || 
        (billingInfo?.subscriptionStatus === "CANCELLED" && 
         !!billingInfo.subscriptionExpiresAt && 
         new Date(billingInfo.subscriptionExpiresAt) > new Date());
    
    const isTrialing = billingInfo?.subscriptionStatus === "TRIALING";
    const hasAllocations = (isSubscribed || isTrialing) && !!billingInfo?.planLimits;

    const [clinicName, setClinicName] = useState("");
    const [repName, setRepName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [timezone, setTimezone] = useState("UTC+08:00 Manila, Singapore");
    const [saving, setSaving] = useState(false);

    // Document Printout & Branding Configuration
    const [primaryColorHex, setPrimaryColorHex] = useState("#0284C7");
    const [primaryLogoUrl, setPrimaryLogoUrl] = useState("");
    const [paperSize, setPaperSize] = useState("Letter");
    const [letterheadHeader, setLetterheadHeader] = useState("");
    const [letterheadSubHeader, setLetterheadSubHeader] = useState("");
    const [letterheadAddress, setLetterheadAddress] = useState("");
    const [savingBranding, setSavingBranding] = useState(false);

    useEffect(() => {
        if (billingInfo) {
            setClinicName(billingInfo.name || billingInfo.clinicName || "");
            setPhone(billingInfo.phoneNumber || "");
            if ((billingInfo as any).email) {
                setEmail((billingInfo as any).email);
            }
            if ((billingInfo as any).primaryColorHex) setPrimaryColorHex((billingInfo as any).primaryColorHex);
            if ((billingInfo as any).primaryLogoUrl) setPrimaryLogoUrl((billingInfo as any).primaryLogoUrl);
            if ((billingInfo as any).paperSize) setPaperSize((billingInfo as any).paperSize);
            if ((billingInfo as any).letterheadHeader) setLetterheadHeader((billingInfo as any).letterheadHeader);
            if ((billingInfo as any).letterheadSubHeader) setLetterheadSubHeader((billingInfo as any).letterheadSubHeader);
            if ((billingInfo as any).letterheadAddress) setLetterheadAddress((billingInfo as any).letterheadAddress);
        }
    }, [billingInfo]);

    const handleSaveBranding = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingBranding(true);
        try {
            await tenantService.updateTenantSettings(tenantSlug, {
                primaryColorHex,
                primaryLogoUrl: primaryLogoUrl.trim() || undefined,
                paperSize,
                letterheadHeader: letterheadHeader.trim() || undefined,
                letterheadSubHeader: letterheadSubHeader.trim() || undefined,
                letterheadAddress: letterheadAddress.trim() || undefined,
            });
            toast.success("Document branding & printout settings saved");
            mutate();
        } catch (err: any) {
            console.error("Failed to save branding settings", err);
            toast.error(err.response?.data?.message || err.message || "Failed to save branding settings");
        } finally {
            setSavingBranding(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await tenantService.updateTenantSettings(tenantSlug, {
                name: clinicName.trim() || undefined,
                representativeName: repName.trim() || undefined,
                email: email.trim() || undefined,
                phoneNumber: phone.trim() || undefined,
                timezone: timezone
            });
            toast.success("Settings saved successfully");
            mutate();
        } catch (err: any) {
            console.error("Failed to save settings", err);
            toast.error(err.response?.data?.message || err.message || "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground text-xs sm:text-sm mt-1">Configure your workspace preferences, profile metadata, and system security.</p>
                </div>
            </div>

            <Tabs defaultValue="general" className="w-full space-y-6">
                <div className="w-full overflow-x-auto pb-1.5 no-scrollbar -mx-1 px-1">
                    <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 justify-start h-auto p-1 bg-muted/65 rounded-xl border flex-nowrap gap-1">
                        <TabsTrigger value="general" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                            <IconSettings className="h-3.5 w-3.5 shrink-0" />
                            General
                        </TabsTrigger>
                        <TabsTrigger value="profile" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                            <IconUser className="h-3.5 w-3.5 shrink-0" />
                            Profile Info
                        </TabsTrigger>
                        <TabsTrigger value="limits" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                            <IconLayersIntersect className="h-3.5 w-3.5 shrink-0" />
                            Limits & Allocations
                        </TabsTrigger>
                        <TabsTrigger value="branding" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                            <IconPalette className="h-3.5 w-3.5 shrink-0" />
                            Print & Branding
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* 1. GENERAL TAB CONTENT */}
                <TabsContent value="general" className="space-y-6 outline-none">
                    <form onSubmit={handleSave}>
                        <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                            <CardHeader className="p-6 pb-4">
                                <CardTitle className="text-lg font-bold">Workspace Configuration</CardTitle>
                                <CardDescription className="text-xs font-medium text-slate-500">
                                    Configure core identity details and routing settings for your clinic workspace.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="clinicName" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Workspace Name</Label>
                                        <Input
                                            id="clinicName"
                                            value={clinicName}
                                            onChange={(e) => setClinicName(e.target.value)}
                                            placeholder="Enter clinic workspace name"
                                            required
                                            className="rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="tenantSlug" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Workspace Domain Slug</Label>
                                        <Input
                                            id="tenantSlug"
                                            value={tenantSlug}
                                            disabled
                                            className="rounded-xl bg-slate-50 border-slate-200 dark:border-slate-800 text-slate-500 dark:bg-slate-900"
                                        />
                                        <p className="text-[10px] text-slate-400 font-medium">Domain slug cannot be changed after registration.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="timezone" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Default Timezone</Label>
                                        <Input
                                            id="timezone"
                                            defaultValue="UTC+08:00 Manila, Singapore"
                                            disabled
                                            className="rounded-xl bg-slate-50 border-slate-200 dark:border-slate-800 text-slate-500 dark:bg-slate-900"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="language" className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Language</Label>
                                        <Input
                                            id="language"
                                            defaultValue="English (United States)"
                                            disabled
                                            className="rounded-xl bg-slate-50 border-slate-200 dark:border-slate-800 text-slate-500 dark:bg-slate-900"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 rounded-b-3xl flex justify-end">
                                <Button 
                                    type="submit" 
                                    disabled={saving}
                                    className="rounded-xl text-xs font-bold px-5 bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1.5"
                                >
                                    <IconDeviceFloppy className="h-4 w-4" />
                                    {saving ? "Saving..." : "Save Changes"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </TabsContent>

                {/* 2. PROFILE TAB CONTENT */}
                <TabsContent value="profile" className="space-y-6 outline-none">
                    <form onSubmit={handleSave}>
                        <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                            <CardHeader className="p-6 pb-4">
                                <CardTitle className="text-lg font-bold">Contact Representative Info</CardTitle>
                                <CardDescription className="text-xs font-medium text-slate-500">
                                    Update contact details and authorized user settings for system alerts.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="repName" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Representative Name</Label>
                                        <Input
                                            id="repName"
                                            value={repName}
                                            onChange={(e) => setRepName(e.target.value)}
                                            placeholder="Authorized representative name"
                                            className="rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="repEmail" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Representative Email</Label>
                                        <Input
                                            id="repEmail"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter billing/representative email"
                                            className="rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-primary"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="repPhone" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mobile / Telephone Number</Label>
                                        <Input
                                            id="repPhone"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+63 900 000 0000"
                                            className="rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-primary"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 rounded-b-3xl flex justify-end">
                                <Button 
                                    type="submit" 
                                    disabled={saving}
                                    className="rounded-xl text-xs font-bold px-5 bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1.5"
                                >
                                    <IconDeviceFloppy className="h-4 w-4" />
                                    {saving ? "Saving..." : "Save Changes"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </TabsContent>

                {/* 3. LIMITS TAB CONTENT */}
                <TabsContent value="limits" className="space-y-6 outline-none">
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                        <CardHeader className="p-6 pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-lg font-bold">Workspace Threshold Allocations</CardTitle>
                                    <CardDescription className="text-xs font-medium text-slate-500 mt-0.5">
                                        View resource metrics and allocation limits provisioned under your plan scope.
                                    </CardDescription>
                                </div>
                                {hasAllocations ? (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 w-fit">
                                        {billingInfo?.planLimits?.planTitle || "Active Plan"}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 w-fit">
                                        Setup Mode &bull; Unsubscribed
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 pt-0 space-y-6">
                            {!hasAllocations ? (
                                <div className="space-y-6">
                                    <div className="flex flex-col sm:flex-row gap-4 items-start p-6 rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20">
                                        <div className="p-3 rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 shrink-0">
                                            <IconAlertTriangle className="h-6 w-6" />
                                        </div>
                                        <div className="space-y-3 flex-1">
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">No Active Plan Subscription</h4>
                                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                                                    This workspace is currently in setup mode with zero provisioned resource quotas. Choose a subscription plan to activate clinical branches, staff accounts, patient records, and API usage quotas.
                                                </p>
                                            </div>
                                            <div className="pt-1">
                                                <Link href={`/${tenantSlug}/dashboard/billing`}>
                                                    <Button size="sm" className="rounded-xl font-semibold gap-2 text-xs shadow-sm">
                                                        <IconCreditCard className="h-4 w-4" />
                                                        Select Plan & Activate Allocations
                                                        <IconArrowRight className="h-3.5 w-3.5" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 opacity-50 grayscale select-none">
                                        <div className="p-5 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clinical Branches</div>
                                            <div className="text-2xl font-bold text-slate-400 mt-1">0 / 0</div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">No Active Plan</div>
                                        </div>
                                        <div className="p-5 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Staff Accounts</div>
                                            <div className="text-2xl font-bold text-slate-400 mt-1">0 / 0</div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">No Active Plan</div>
                                        </div>
                                        <div className="p-5 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Patients</div>
                                            <div className="text-2xl font-bold text-slate-400 mt-1">0 / 0</div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">No Active Plan</div>
                                        </div>
                                        <div className="p-5 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly Api Quota</div>
                                            <div className="text-2xl font-bold text-slate-400 mt-1">0 / 0</div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">No Active Plan</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clinical Branches</div>
                                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                                                {billingInfo?.usage?.facilitiesCount ?? 0} / {billingInfo?.planLimits?.maxClinics && billingInfo.planLimits.maxClinics >= 9999 ? "Unlimited" : billingInfo?.planLimits?.maxClinics}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">
                                                {billingInfo?.planLimits?.planTitle} Limit
                                            </div>
                                        </div>
                                        <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Staff Accounts</div>
                                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                                                {billingInfo?.usage?.staffAccountsCount ?? 1} / {billingInfo?.planLimits?.maxStaff && billingInfo.planLimits.maxStaff >= 9999 ? "Unlimited" : billingInfo?.planLimits?.maxStaff}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">
                                                {billingInfo?.planLimits?.planTitle} Limit
                                            </div>
                                        </div>
                                        <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Patients</div>
                                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                                                {billingInfo?.usage?.activePatientRecordsCount ?? 0} / {billingInfo?.planLimits?.maxPatients && billingInfo.planLimits.maxPatients >= 999999 ? "Unlimited" : billingInfo?.planLimits?.maxPatients?.toLocaleString()}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">
                                                {billingInfo?.planLimits?.planTitle} Limit
                                            </div>
                                        </div>
                                        <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly Api Quota</div>
                                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                                                {billingInfo?.usage?.monthlyApiQuotaUsed ?? 0} / {billingInfo?.planLimits?.monthlyApiQuotaLimit && billingInfo.planLimits.monthlyApiQuotaLimit >= 1000000 ? "Unlimited" : `${((billingInfo?.planLimits?.monthlyApiQuotaLimit ?? 10000) / 1000).toFixed(0)}k`}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">
                                                Included Allocations
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-blue-100 dark:border-blue-900/30 bg-blue-50/20 dark:bg-blue-950/20 rounded-2xl">
                                        <div className="flex items-start gap-3">
                                            <IconInfoCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                                            <div className="space-y-0.5">
                                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Need higher allocation thresholds?</h4>
                                                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                                    You can increase your workspace limits by upgrading your subscription tier anytime.
                                                </p>
                                            </div>
                                        </div>
                                        <Link href={`/${tenantSlug}/dashboard/billing`} className="shrink-0">
                                            <Button variant="outline" size="sm" className="rounded-xl text-xs font-semibold gap-1.5 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50">
                                                Manage Plan
                                                <IconArrowRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </Link>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 4. PRINT & DOCUMENT BRANDING TAB CONTENT */}
                <TabsContent value="branding" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Left: Branding Form */}
                        <div className="lg:col-span-7 space-y-6">
                            <form onSubmit={handleSaveBranding}>
                                <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                                    <CardHeader className="p-6 pb-4">
                                        <CardTitle className="text-lg font-bold">Printout & Document Customizer</CardTitle>
                                        <CardDescription className="text-xs font-medium text-slate-500">
                                            Customize your facility branding, letterhead styling, color accents, and paper sizes for official Medical Certificates, Prescriptions, and Diagnostic Slips.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0 space-y-5">
                                        {/* Color Picker & Presets */}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Primary Brand Accent Color
                                            </Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={primaryColorHex}
                                                    onChange={(e) => setPrimaryColorHex(e.target.value)}
                                                    className="h-10 w-12 rounded-xl cursor-pointer border border-slate-200 p-1 bg-white"
                                                />
                                                <Input
                                                    value={primaryColorHex}
                                                    onChange={(e) => setPrimaryColorHex(e.target.value)}
                                                    placeholder="#0284C7"
                                                    className="font-mono text-xs max-w-[120px] rounded-xl"
                                                />
                                                {/* Palette Presets */}
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {[
                                                        { color: "#0284C7", label: "Sky Blue" },
                                                        { color: "#059669", label: "Emerald" },
                                                        { color: "#4F46E5", label: "Indigo" },
                                                        { color: "#0D9488", label: "Teal" },
                                                        { color: "#E11D48", label: "Rose" },
                                                        { color: "#334155", label: "Slate" }
                                                    ].map((p) => (
                                                        <button
                                                            key={p.color}
                                                            type="button"
                                                            onClick={() => setPrimaryColorHex(p.color)}
                                                            className="h-6 w-6 rounded-full border border-slate-300 transition-transform hover:scale-110 flex items-center justify-center"
                                                            style={{ backgroundColor: p.color }}
                                                            title={p.label}
                                                        >
                                                            {primaryColorHex.toLowerCase() === p.color.toLowerCase() && (
                                                                <IconCheck className="h-3 w-3 text-white" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Primary Facility Logo URL */}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Primary Facility Logo URL
                                            </Label>
                                            <Input
                                                value={primaryLogoUrl}
                                                onChange={(e) => setPrimaryLogoUrl(e.target.value)}
                                                placeholder="https://your-domain.com/logos/clinic-logo.png"
                                                className="text-xs rounded-xl"
                                            />
                                            <p className="text-[11px] text-slate-400">
                                                Recommended: Transparent PNG (approx. 200x200px). Displayed on the digital letterhead.
                                            </p>
                                        </div>

                                        {/* Paper Size Selection */}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Default Printout Paper Size
                                            </Label>
                                            <select
                                                value={paperSize}
                                                onChange={(e) => setPaperSize(e.target.value)}
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="Letter">Letter (8.5&quot; x 11&quot; - Philippine Standard)</option>
                                                <option value="A4">A4 (210mm x 297mm - International Standard)</option>
                                                <option value="A5">A5 (148mm x 210mm - Compact Prescription Slip)</option>
                                            </select>
                                        </div>

                                        {/* Letterhead Header Override */}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Letterhead Facility Name
                                            </Label>
                                            <Input
                                                value={letterheadHeader}
                                                onChange={(e) => setLetterheadHeader(e.target.value)}
                                                placeholder={clinicName || "METRO HEALTH MEDICAL CLINIC"}
                                                className="text-xs rounded-xl"
                                            />
                                        </div>

                                        {/* Subheader / Tagline */}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Facility Subheader / Accreditation Line
                                            </Label>
                                            <Input
                                                value={letterheadSubHeader}
                                                onChange={(e) => setLetterheadSubHeader(e.target.value)}
                                                placeholder="Accredited Outpatient Medical Facility • PhilHealth Konsulta Provider"
                                                className="text-xs rounded-xl"
                                            />
                                        </div>

                                        {/* Physical Address */}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Facility Physical Address & Contacts
                                            </Label>
                                            <Input
                                                value={letterheadAddress}
                                                onChange={(e) => setLetterheadAddress(e.target.value)}
                                                placeholder="Unit 201 Medical Arts Building, Manila, Philippines • (02) 8123-4567"
                                                className="text-xs rounded-xl"
                                            />
                                        </div>
                                    </CardContent>
                                    <CardFooter className="p-6 pt-0 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                                        <Button
                                            type="submit"
                                            disabled={savingBranding}
                                            className="rounded-xl text-xs font-semibold gap-1.5 shadow-sm"
                                        >
                                            <IconDeviceFloppy className="h-4 w-4" />
                                            {savingBranding ? "Saving Branding..." : "Save Printout Preferences"}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </form>
                        </div>

                        {/* Right: Live Interactive Document Simulator */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <IconFileText className="h-4 w-4 text-blue-600" />
                                    Live Document Preview ({paperSize})
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    QuestPDF Hardened Canvas
                                </span>
                            </div>

                            {/* Simulated Paper Sheet */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md space-y-4 text-slate-900 transition-all">
                                {/* Letterhead */}
                                <div className="border-b-2 pb-3 flex items-start justify-between gap-2" style={{ borderColor: primaryColorHex }}>
                                    <div className="space-y-0.5">
                                        <h4 className="font-extrabold text-sm uppercase tracking-wide" style={{ color: primaryColorHex }}>
                                            {letterheadHeader || clinicName || "METRO HEALTH OUTPATIENT CLINIC"}
                                        </h4>
                                        <p className="text-[10px] text-slate-500 font-medium">
                                            {letterheadSubHeader || "Accredited Outpatient Medical Facility"}
                                        </p>
                                        <p className="text-[9px] text-slate-400">
                                            {letterheadAddress || "Unit 201 Medical Arts Bldg, Philippines"}
                                        </p>
                                    </div>
                                    <div className="h-8 w-8 rounded-lg flex items-center justify-center font-black text-white text-xs shrink-0 shadow-sm" style={{ backgroundColor: primaryColorHex }}>
                                        Rx
                                    </div>
                                </div>

                                {/* Document Title */}
                                <div className="text-center py-1">
                                    <span className="font-black text-xs tracking-wider uppercase block" style={{ color: primaryColorHex }}>
                                        Official Medical Certificate
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-mono">
                                        Doc No: MC-20261004-0001 • Date: Oct 04, 2026
                                    </span>
                                </div>

                                {/* Body Snippet */}
                                <div className="text-[10px] text-slate-700 leading-relaxed space-y-2 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                                    <p>
                                        This certifies that <strong className="text-slate-900">Juan Dela Cruz</strong>, 38y, Male, was evaluated on Oct 04, 2026.
                                    </p>
                                    <div className="p-2 rounded bg-white border border-slate-200/80">
                                        <span className="font-bold text-[9px] text-slate-800 block">Diagnosis: Acute Bronchitis (J20.9)</span>
                                        <span className="text-[9px] text-slate-500">Fitness: Unfit for work • 3 days rest recommended</span>
                                    </div>
                                </div>

                                {/* Signature Stamp */}
                                <div className="text-right pt-2 border-t border-slate-100 space-y-0.5">
                                    <p className="text-[10px] font-bold text-slate-900">Dr. Roberto Cruz, MD</p>
                                    <p className="text-[8px] text-slate-500">PRC Lic. No.: PRC-0149281 • PTR: 891247</p>
                                    <span className="inline-block text-[8px] font-bold text-emerald-600">
                                        ✓ Digitally Certified & Sealed
                                    </span>
                                </div>

                                {/* Document Footer Component Simulation */}
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[8px] text-slate-400 font-mono">
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-5 w-5 bg-slate-200 rounded flex items-center justify-center text-[7px] font-black text-slate-700">
                                            QR
                                        </div>
                                        <span>SEC-SHA256-4A9F21B90</span>
                                    </div>
                                    <span>Page 1 of 1 ({paperSize})</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
