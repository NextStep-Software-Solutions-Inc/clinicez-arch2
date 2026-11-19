"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { tenantService, WorkspaceGeneral } from "@/services/tenant.service";

// Must stay in sync with WorkspaceSettings.SupportedDateFormats on the API.
const DATE_FORMATS = [
    { value: "MMM d, yyyy", example: "Oct 9, 2026" },
    { value: "d MMM yyyy", example: "9 Oct 2026" },
    { value: "dd/MM/yyyy", example: "09/10/2026" },
    { value: "MM/dd/yyyy", example: "10/09/2026" },
    { value: "yyyy-MM-dd", example: "2026-10-09" },
];

const LOCALES = [
    { value: "en-PH", label: "English (Philippines)" },
    { value: "en-US", label: "English (United States)" },
    { value: "en-GB", label: "English (United Kingdom)" },
    { value: "en-SG", label: "English (Singapore)" },
    { value: "fil-PH", label: "Filipino (Philippines)" },
];

const CURRENCIES = ["PHP", "USD", "SGD", "EUR", "GBP", "AUD", "JPY", "AED", "SAR"];

const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider";

function supportedTimeZones(current: string): string[] {
    let zones: string[] = [];
    try {
        zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
        zones = [];
    }
    if (zones.length === 0) zones = ["Asia/Manila", "Asia/Singapore", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"];
    return zones.includes(current) ? zones : [current, ...zones];
}

interface GeneralTabProps {
    tenantSlug: string;
    general: WorkspaceGeneral;
    onSaved: () => void;
}

export function GeneralTab({ tenantSlug, general, onSaved }: GeneralTabProps) {
    const [form, setForm] = useState<WorkspaceGeneral>(general);
    const [saving, setSaving] = useState(false);

    const timeZones = useMemo(() => supportedTimeZones(general.timeZoneId), [general.timeZoneId]);
    const set = <K extends keyof WorkspaceGeneral>(key: K, value: WorkspaceGeneral[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await tenantService.updateGeneral(tenantSlug, {
                ...form,
                name: form.name.trim(),
                email: form.email.trim(),
                representativeName: form.representativeName?.trim() || null,
                phoneNumber: form.phoneNumber?.trim() || null,
            });
            toast.success("Workspace settings saved");
            onSaved();
        } catch (err: any) {
            toast.error(err.response?.data?.errors?.[0]?.message || err.message || "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="space-y-6">
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold">Workspace Identity</CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        The name and contact details of the organization that owns this workspace and all of its branches and facilities.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="workspaceName" className={labelClass}>Workspace Name</Label>
                            <Input
                                id="workspaceName"
                                value={form.name}
                                onChange={(e) => set("name", e.target.value)}
                                maxLength={120}
                                required
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tenantSlug" className={labelClass}>Workspace Slug</Label>
                            <Input id="tenantSlug" value={tenantSlug} disabled className="rounded-xl bg-slate-50 text-slate-500 dark:bg-slate-900" />
                            <p className="text-[10px] text-slate-400 font-medium">The slug is part of your workspace URL and cannot be changed.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="repName" className={labelClass}>Representative Name</Label>
                            <Input
                                id="repName"
                                value={form.representativeName ?? ""}
                                onChange={(e) => set("representativeName", e.target.value)}
                                placeholder="Authorized representative"
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="repEmail" className={labelClass}>Contact Email</Label>
                            <Input
                                id="repEmail"
                                type="email"
                                value={form.email}
                                onChange={(e) => set("email", e.target.value)}
                                required
                                className="rounded-xl"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="repPhone" className={labelClass}>Phone Number</Label>
                            <Input
                                id="repPhone"
                                value={form.phoneNumber ?? ""}
                                onChange={(e) => set("phoneNumber", e.target.value)}
                                placeholder="+63 900 000 0000"
                                className="rounded-xl"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold">Regional Defaults</CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        Defaults for time, language, date and currency. Facilities and branches use these unless they define their own.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="timeZone" className={labelClass}>Default Time Zone</Label>
                            <SelectField
                                id="timeZone"
                                value={form.timeZoneId}
                                onValueChange={(v) => set("timeZoneId", v)}
                                size="md"
                                className="text-sm"
                                options={timeZones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="locale" className={labelClass}>Language &amp; Region</Label>
                            <SelectField
                                id="locale"
                                value={form.locale}
                                onValueChange={(v) => set("locale", v)}
                                size="md"
                                className="text-sm"
                                options={
                                    LOCALES.some((l) => l.value === form.locale)
                                        ? LOCALES
                                        : [{ value: form.locale, label: form.locale }, ...LOCALES]
                                }
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="dateFormat" className={labelClass}>Date Format</Label>
                            <SelectField
                                id="dateFormat"
                                value={form.dateFormat}
                                onValueChange={(v) => set("dateFormat", v)}
                                size="md"
                                className="text-sm"
                                options={DATE_FORMATS.map((f) => ({
                                    value: f.value,
                                    label: `${f.example} (${f.value})`,
                                }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="currency" className={labelClass}>Currency</Label>
                            <SelectField
                                id="currency"
                                value={form.currencyCode}
                                onValueChange={(v) => set("currencyCode", v)}
                                size="md"
                                className="text-sm"
                                options={(CURRENCIES.includes(form.currencyCode)
                                    ? CURRENCIES
                                    : [form.currencyCode, ...CURRENCIES]
                                ).map((c) => ({ value: c, label: c }))}
                            />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 rounded-b-3xl flex justify-end">
                    <Button type="submit" disabled={saving} className="rounded-xl text-xs font-bold px-5 flex items-center gap-1.5">
                        <IconDeviceFloppy className="h-4 w-4" />
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    );
}
