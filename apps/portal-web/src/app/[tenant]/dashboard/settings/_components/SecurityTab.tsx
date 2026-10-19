"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IconDeviceFloppy, IconInfoCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { tenantService, WorkspaceSecurity } from "@/services/tenant.service";
import { apiErrorMessage } from "@/lib/apiError";

// Must stay in sync with WorkspaceSettings.Min/MaxIdleTimeoutMinutes on the API (0 = off).
const IDLE_PRESETS = [
    { value: 0, label: "Off - stay signed in" },
    { value: 15, label: "15 minutes" },
    { value: 30, label: "30 minutes" },
    { value: 60, label: "1 hour" },
    { value: 120, label: "2 hours" },
    { value: 240, label: "4 hours" },
    { value: 480, label: "8 hours" },
];

const selectClass =
    "w-full h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider";

interface SecurityTabProps {
    tenantSlug: string;
    security: WorkspaceSecurity;
    onSaved: () => void;
}

export function SecurityTab({ tenantSlug, security, onSaved }: SecurityTabProps) {
    const [requireMfa, setRequireMfa] = useState(security.requireMfa);
    const [idle, setIdle] = useState(security.idleTimeoutMinutes);
    const [domains, setDomains] = useState(security.allowedInviteDomains.join("\n"));
    const [saving, setSaving] = useState(false);

    const idleOptions = IDLE_PRESETS.some((p) => p.value === idle)
        ? IDLE_PRESETS
        : [...IDLE_PRESETS, { value: idle, label: `${idle} minutes` }].sort((a, b) => a.value - b.value);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await tenantService.updateSecurity(tenantSlug, {
                requireMfa,
                idleTimeoutMinutes: idle,
                allowedInviteDomains: domains
                    .split(/[\s,;]+/)
                    .map((d) => d.trim())
                    .filter(Boolean),
            });
            toast.success("Security settings saved");
            onSaved();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "Failed to save security settings"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="space-y-6">
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold">Sign-in Policy</CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        Applies to everyone who signs in to this workspace dashboard.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-6">
                    <div className="flex items-start gap-3">
                        <Checkbox id="requireMfa" checked={requireMfa} onCheckedChange={(v) => setRequireMfa(v === true)} className="mt-0.5" />
                        <div className="space-y-1">
                            <Label htmlFor="requireMfa" className="text-sm font-semibold">Require two-step verification (MFA)</Label>
                            <p className="text-xs text-slate-500">
                                Members without MFA on their account are asked to turn it on before they can use the dashboard.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="idleTimeout" className={labelClass}>Sign out after inactivity</Label>
                        <select id="idleTimeout" value={idle} onChange={(e) => setIdle(Number(e.target.value))} className={selectClass}>
                            {idleOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-4 flex gap-3 text-xs text-slate-600 dark:text-slate-400">
                        <IconInfoCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>
                            MFA and the inactivity timeout are enforced in this workspace dashboard only. Each facility console is a
                            separate service with its own sign-in and session handling, so they are not covered by these two settings.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold">Team Invitations</CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        Limit which email domains staff can be invited from. Leave empty to allow any domain.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-3">
                    <Label htmlFor="inviteDomains" className={labelClass}>Allowed email domains</Label>
                    <Textarea
                        id="inviteDomains"
                        value={domains}
                        onChange={(e) => setDomains(e.target.value)}
                        placeholder={"metroclinic.ph\nmetrohealth.com"}
                        rows={4}
                        className="rounded-xl font-mono text-sm"
                    />
                    <p className="text-[11px] text-slate-400 font-medium">
                        One domain per line, up to 20. Applies to new invitations and to pending invitations that have not been accepted yet.
                        People who already joined are not removed.
                    </p>
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
