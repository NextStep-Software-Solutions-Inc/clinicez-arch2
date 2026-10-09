"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IconDeviceFloppy, IconInfoCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { tenantService, WorkspaceCompliance } from "@/services/tenant.service";
import { apiErrorMessage } from "@/lib/apiError";

const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider";

interface ComplianceTabProps {
    tenantSlug: string;
    compliance: WorkspaceCompliance;
    onSaved: () => void;
}

export function ComplianceTab({ tenantSlug, compliance, onSaved }: ComplianceTabProps) {
    const [dpoName, setDpoName] = useState(compliance.dpoName ?? "");
    const [dpoEmail, setDpoEmail] = useState(compliance.dpoEmail ?? "");
    const [privacyUrl, setPrivacyUrl] = useState(compliance.privacyNoticeUrl ?? "");
    const [saving, setSaving] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await tenantService.updateCompliance(tenantSlug, {
                dpoName: dpoName.trim() || null,
                dpoEmail: dpoEmail.trim() || null,
                privacyNoticeUrl: privacyUrl.trim() || null,
            });
            toast.success("Compliance settings saved");
            onSaved();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "Failed to save compliance settings"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="space-y-6">
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold">Data Privacy</CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        Your Data Protection Officer and privacy notice under the Data Privacy Act (RA 10173).
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="dpoName" className={labelClass}>DPO Name</Label>
                            <Input id="dpoName" value={dpoName} onChange={(e) => setDpoName(e.target.value)} maxLength={120} placeholder="Data Protection Officer" className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dpoEmail" className={labelClass}>DPO Email</Label>
                            <Input id="dpoEmail" type="email" value={dpoEmail} onChange={(e) => setDpoEmail(e.target.value)} maxLength={254} placeholder="dpo@yourclinic.ph" className="rounded-xl" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="privacyUrl" className={labelClass}>Privacy Notice URL</Label>
                        <Input id="privacyUrl" type="url" value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} maxLength={2048} placeholder="https://yourclinic.ph/privacy" className="rounded-xl" />
                        <p className="text-[10px] text-slate-400 font-medium">Must be a public https:// address.</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-4 flex gap-3 text-xs text-slate-600 dark:text-slate-400">
                        <IconInfoCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>
                            These details are meant for patients and are shared with every facility in this workspace, so each
                            facility can show the same DPO contact and privacy notice. Do not enter a personal email you do not
                            want published.
                        </p>
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
