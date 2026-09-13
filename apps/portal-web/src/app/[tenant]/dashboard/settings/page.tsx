"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useBillingInfo } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { IconSettings, IconUser, IconLayersIntersect, IconInfoCircle, IconDeviceFloppy } from "@tabler/icons-react";
import { toast } from "sonner";

export default function SettingsPage() {
    const params = useParams();
    const tenantSlug = params?.tenant as string;
    const { billingInfo, mutate } = useBillingInfo(tenantSlug);

    const [clinicName, setClinicName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (billingInfo) {
            setClinicName(billingInfo.clinicName || "");
            setPhone(billingInfo.phoneNumber || "");
        }
    }, [billingInfo]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Mock API save call to simulate workspace configuration update
            await new Promise((resolve) => setTimeout(resolve, 800));
            toast.success("Settings saved successfully");
            mutate();
        } catch (err) {
            console.error("Failed to save settings", err);
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col gap-8 p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground mt-1">Configure your workspace preferences, profile metadata, and system security.</p>
                </div>
            </div>

            <Tabs defaultValue="general" className="w-full space-y-6">
                <TabsList className="grid grid-cols-3 md:inline-flex w-full md:w-auto h-auto p-1 bg-muted/65 rounded-xl border">
                    <TabsTrigger value="general" className="px-6 py-2 text-xs font-semibold flex items-center gap-1.5">
                        <IconSettings className="h-3.5 w-3.5" />
                        General
                    </TabsTrigger>
                    <TabsTrigger value="profile" className="px-6 py-2 text-xs font-semibold flex items-center gap-1.5">
                        <IconUser className="h-3.5 w-3.5" />
                        Profile Info
                    </TabsTrigger>
                    <TabsTrigger value="limits" className="px-6 py-2 text-xs font-semibold flex items-center gap-1.5">
                        <IconLayersIntersect className="h-3.5 w-3.5" />
                        Limits & Allocations
                    </TabsTrigger>
                </TabsList>

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
                                            defaultValue="Dr. Admin"
                                            placeholder="Authorized representative name"
                                            className="rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="repEmail" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Representative Email</Label>
                                        <Input
                                            id="repEmail"
                                            type="email"
                                            defaultValue="admin@clinicez.net"
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
                            <CardTitle className="text-lg font-bold">Workspace Threshold Allocations</CardTitle>
                            <CardDescription className="text-xs font-medium text-slate-500">
                                View resource metrics and allocation limits provisioned under your plan scope.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 pt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clinical Branches</div>
                                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">3 Max</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">Basic Tier Limit</div>
                                </div>
                                <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Staff Accounts</div>
                                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">5 Max</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">Basic Tier Limit</div>
                                </div>
                                <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Patients</div>
                                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">100 Max</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">Basic Tier Limit</div>
                                </div>
                                <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly Api Quota</div>
                                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">10k / Mo</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">Included Allocations</div>
                                </div>
                            </div>

                            <div className="mt-6 flex items-start gap-3 p-4 border border-blue-100 dark:border-blue-900/30 bg-blue-50/20 dark:bg-blue-950/20 rounded-2xl">
                                <IconInfoCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Need higher allocation thresholds?</h4>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                        You can increase your workspace limits by upgrading your subscription tier. Head to the billing tab to compare plans.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
