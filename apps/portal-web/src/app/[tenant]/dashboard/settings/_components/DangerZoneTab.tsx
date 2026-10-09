"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/apiError";
import { tenantService } from "@/services/tenant.service";
import { staffService } from "@/services/staff.service";

interface DangerZoneTabProps {
    tenantSlug: string;
    viewerRole: string;
}

export function DangerZoneTab({ tenantSlug, viewerRole }: DangerZoneTabProps) {
    const isOwner = viewerRole === "Owner";

    const { data: staff } = useSWR(
        isOwner ? `danger-zone-staff/${tenantSlug}` : null,
        () => staffService.getTenantStaff(tenantSlug),
        { revalidateOnFocus: false },
    );
    const candidates = (staff?.members ?? []).filter((m) => m.role === "Admin" && m.status === "Active" && !!m.userId);

    const [targetId, setTargetId] = useState("");
    const [transferConfirm, setTransferConfirm] = useState("");
    const [transferring, setTransferring] = useState(false);

    const [archiveConfirm, setArchiveConfirm] = useState("");
    const [archiving, setArchiving] = useState(false);

    if (!isOwner) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-sm text-amber-800 dark:text-amber-300">
                Only the workspace Owner can transfer ownership or archive the workspace.
            </div>
        );
    }

    const transfer = async () => {
        setTransferring(true);
        try {
            const result = await tenantService.transferOwnership(tenantSlug, { targetStaffMemberId: targetId, confirmSlug: transferConfirm });
            toast.success(`${result.newOwnerName} is now the workspace owner. You are now an ${result.previousOwnerNewRole}.`);
            window.location.reload();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "Ownership could not be transferred."));
            setTransferring(false);
        }
    };

    const archive = async () => {
        setArchiving(true);
        try {
            await tenantService.archiveWorkspace(tenantSlug, archiveConfirm);
            toast.success("Workspace archived.");
            window.location.reload();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "The workspace could not be archived."));
            setArchiving(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="rounded-3xl border-red-200 dark:border-red-900/60 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-red-700 dark:text-red-400">
                        <IconAlertTriangle className="h-5 w-5" /> Transfer ownership
                    </CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        Hand the workspace to an active Admin. You become an Admin. The new owner controls billing,
                        archiving and further transfers.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="transfer-target" className="text-xs font-bold">New owner</Label>
                        <select
                            id="transfer-target"
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            className="h-10 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="">Select an active Admin...</option>
                            {candidates.map((m) => (
                                <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>
                            ))}
                        </select>
                        {staff && candidates.length === 0 && (
                            <p className="text-xs text-slate-500">
                                No eligible member. Promote an active staff member to Admin first; they must have accepted their invitation.
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="transfer-confirm" className="text-xs font-bold">
                            Type <span className="font-mono">{tenantSlug}</span> to confirm
                        </Label>
                        <Input id="transfer-confirm" value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} autoComplete="off" className="rounded-xl" />
                    </div>
                    <Button
                        variant="destructive"
                        disabled={transferring || !targetId || transferConfirm.trim().toLowerCase() !== tenantSlug.toLowerCase()}
                        onClick={transfer}
                        className="rounded-xl font-bold"
                    >
                        {transferring ? "Transferring..." : "Transfer ownership"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-red-200 dark:border-red-900/60 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-red-700 dark:text-red-400">
                        <IconAlertTriangle className="h-5 w-5" /> Archive workspace
                    </CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        Closes this workspace in the portal: the dashboard and settings become read-only for everyone,
                        every facility is marked Suspended and its console links are hidden. No data is deleted.
                        Facility services keep running on their own servers, and only ClinicEz support can restore an
                        archived workspace. An active subscription must be cancelled first.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="archive-confirm" className="text-xs font-bold">
                            Type <span className="font-mono">{tenantSlug}</span> to confirm
                        </Label>
                        <Input id="archive-confirm" value={archiveConfirm} onChange={(e) => setArchiveConfirm(e.target.value)} autoComplete="off" className="rounded-xl" />
                    </div>
                    <Button
                        variant="destructive"
                        disabled={archiving || archiveConfirm.trim().toLowerCase() !== tenantSlug.toLowerCase()}
                        onClick={archive}
                        className="rounded-xl font-bold"
                    >
                        {archiving ? "Archiving..." : "Archive workspace"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
