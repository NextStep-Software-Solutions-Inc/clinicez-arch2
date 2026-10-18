"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { IconBuildingHospital, IconCloud, IconServer, IconExternalLink, IconKey, IconWorld } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useHubCredentials } from "@/components/dashboard/HubCredentialsDialog";
import { useEntitlements } from "@/hooks/useEntitlements";
import { branchService, BranchDto } from "@/services/branch.service";
import { tenantService, FacilityDeploymentMode } from "@/services/tenant.service";
import {
    facilityService,
    hubServiceFor,
    HUB_ROTATABLE_SERVICES,
    HubRotatableService,
    WorkspaceFacility,
    FacilityVisibility,
} from "@/services/facility.service";
import { linkService } from "@/services/link.service";
import { ENTITLEMENT_KEYS } from "@/services/entitlement.service";
import { apiErrorMessage } from "@/lib/apiError";
import { toastApiError } from "@/lib/apiToast";

const selectClass =
    "h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary";

const VISIBILITY_HELP: Record<FacilityVisibility, string> = {
    Private: "Only your workspace can see this facility.",
    Network: "Facilities you link with can see it.",
    Public: "Listed in the directory so other workspaces can find it.",
};

interface FacilityRowProps {
    tenantSlug: string;
    facility: WorkspaceFacility;
    /** Unknown while entitlements load or when the viewer cannot read them; the server enforces either way. */
    interopAvailable: boolean | undefined;
    onSaved: () => void;
}

function FacilityRow({ tenantSlug, facility, interopAvailable, onSaved }: FacilityRowProps) {
    const { showRotated } = useHubCredentials();
    const [mode, setMode] = useState<FacilityDeploymentMode>(facility.deploymentMode);
    const [url, setUrl] = useState(facility.consoleBaseUrl ?? "");
    const [saving, setSaving] = useState(false);

    const currentVisibility: FacilityVisibility = facility.visibility;
    const currentAccepts = facility.acceptsExternalRequests;
    const [visibility, setVisibility] = useState<FacilityVisibility>(currentVisibility);
    const [accepts, setAccepts] = useState(currentAccepts);
    const [savingVisibility, setSavingVisibility] = useState(false);

    const [rotateService, setRotateService] = useState<HubRotatableService>(hubServiceFor(facility.facilityType));
    const [confirmingRotate, setConfirmingRotate] = useState(false);
    const [rotating, setRotating] = useState(false);

    const dirty =
        mode !== facility.deploymentMode ||
        (mode === "OnPremise" && url.trim() !== (facility.consoleBaseUrl ?? ""));

    const visibilityDirty = visibility !== currentVisibility || accepts !== currentAccepts;
    const interopLocked = interopAvailable === false;

    const save = async () => {
        setSaving(true);
        try {
            await tenantService.updateFacilityDeployment(tenantSlug, facility.id, {
                deploymentMode: mode,
                consoleBaseUrl: mode === "OnPremise" ? url.trim() : null,
            });
            toast.success(`${facility.name} deployment saved`);
            onSaved();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "Failed to save deployment"));
        } finally {
            setSaving(false);
        }
    };

    const changeVisibility = (next: FacilityVisibility) => {
        setVisibility(next);
        if (next !== "Public") setAccepts(false);
    };

    const saveVisibility = async () => {
        setSavingVisibility(true);
        try {
            await linkService.setVisibility(tenantSlug, facility.id, {
                visibility,
                acceptsExternalRequests: visibility === "Public" && accepts,
            });
            toast.success(`${facility.name} visibility saved`);
            onSaved();
        } catch (err: unknown) {
            toastApiError(err, "Failed to save visibility", tenantSlug);
        } finally {
            setSavingVisibility(false);
        }
    };

    const rotate = async () => {
        setRotating(true);
        try {
            const rotated = await facilityService.rotateHubCredentials(tenantSlug, facility.id, rotateService);
            setConfirmingRotate(false);
            showRotated(facility.name, rotated);
        } catch (err: unknown) {
            toastApiError(err, "Failed to rotate hub credentials", tenantSlug);
        } finally {
            setRotating(false);
        }
    };

    return (
        <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <IconBuildingHospital className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm font-semibold">{facility.name}</span>
                <Badge variant="outline" className="text-[10px]">{facility.facilityType}</Badge>
                <Badge variant={facility.status === "Active" ? "default" : "secondary"} className="text-[10px]">{facility.status}</Badge>
                {facility.consoleUrl && (
                    <a
                        href={facility.consoleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs text-primary inline-flex items-center gap-1 hover:underline"
                    >
                        Open console <IconExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <select
                    aria-label={`${facility.name} deployment`}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as FacilityDeploymentMode)}
                    className={selectClass}
                >
                    <option value="SharedCloud">Shared cloud</option>
                    <option value="OnPremise">On-premise</option>
                </select>

                {mode === "OnPremise" ? (
                    <Input
                        aria-label={`${facility.name} console address`}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://clinic.hospital.local"
                        maxLength={2048}
                        className="h-9 rounded-xl text-xs flex-1 min-w-56"
                    />
                ) : (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                        <IconCloud className="h-3.5 w-3.5" /> Console address is generated by Clinic EZ
                    </span>
                )}

                <Button type="button" size="sm" disabled={!dirty || saving} onClick={save} className="rounded-xl text-xs font-bold">
                    {saving ? "Saving..." : "Save"}
                </Button>
            </div>

            <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <IconWorld className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-bold">Network visibility</span>
                    <select
                        aria-label={`${facility.name} visibility`}
                        value={visibility}
                        disabled={interopLocked}
                        onChange={(e) => changeVisibility(e.target.value as FacilityVisibility)}
                        className={selectClass}
                    >
                        <option value="Private">Private</option>
                        <option value="Network">Network</option>
                        <option value="Public">Public</option>
                    </select>
                    <label className={`flex items-center gap-1.5 text-xs ${interopLocked || visibility !== "Public" ? "text-slate-400" : ""}`}>
                        <input
                            type="checkbox"
                            checked={accepts}
                            disabled={interopLocked || visibility !== "Public"}
                            onChange={(e) => setAccepts(e.target.checked)}
                        />
                        Accept link requests automatically
                    </label>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!visibilityDirty || savingVisibility || interopLocked}
                        onClick={saveVisibility}
                        className="rounded-xl text-xs font-bold ml-auto"
                    >
                        {savingVisibility ? "Saving..." : "Save visibility"}
                    </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                    {VISIBILITY_HELP[visibility]}
                    {visibility === "Public" && " Automatic acceptance activates incoming links without an admin review."}
                </p>
                {interopLocked && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        Cross-workspace links are not part of your current plan.{" "}
                        <Link href={`/${tenantSlug}/dashboard/plan`} className="font-semibold underline">
                            View plans
                        </Link>
                    </p>
                )}
            </div>

            {facility.deploymentMode === "OnPremise" && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
                    <IconKey className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-bold">Hub credentials</span>
                    <select
                        aria-label={`${facility.name} hub client`}
                        value={rotateService}
                        onChange={(e) => {
                            setRotateService(e.target.value as HubRotatableService);
                            setConfirmingRotate(false);
                        }}
                        className={selectClass}
                    >
                        {HUB_ROTATABLE_SERVICES.map((s) => (
                            <option key={s} value={s}>
                                {s === "cell" ? "cell (upstream)" : s}
                            </option>
                        ))}
                    </select>
                    {confirmingRotate ? (
                        <>
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                                The current {rotateService} secret and signing key stop working immediately.
                            </span>
                            <Button type="button" size="sm" variant="destructive" disabled={rotating} onClick={rotate} className="rounded-xl text-xs font-bold">
                                {rotating ? "Rotating..." : "Rotate now"}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" disabled={rotating} onClick={() => setConfirmingRotate(false)} className="rounded-xl text-xs">
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingRotate(true)} className="rounded-xl text-xs font-bold">
                            Rotate hub credentials
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

interface FacilitiesTabProps {
    tenantSlug: string;
}

export function FacilitiesTab({ tenantSlug }: FacilitiesTabProps) {
    const { hasFeature } = useEntitlements(tenantSlug);
    const interopAvailable = hasFeature(ENTITLEMENT_KEYS.crossTenantInterop);

    const { data, isLoading, error, mutate } = useSWR(
        `workspace-facilities/${tenantSlug}`,
        async () => {
            const [branches, facilities] = await Promise.all([
                branchService.getBranches(tenantSlug),
                facilityService.getFacilities(tenantSlug),
            ]);
            return { branches, facilities };
        },
        { revalidateOnFocus: false, shouldRetryOnError: false },
    );

    const groups = useMemo(() => {
        if (!data) return [];
        const byId = new Map(data.facilities.map((f) => [f.id, f]));
        const assigned = new Set<string>();
        const result: { key: string; title: string; subtitle?: string; facilities: WorkspaceFacility[] }[] = data.branches.map((b: BranchDto) => {
            const list = b.facilities
                .map((s) => byId.get(s.id))
                .filter((f): f is WorkspaceFacility => !!f);
            list.forEach((f) => assigned.add(f.id));
            return {
                key: b.id,
                title: b.name,
                subtitle: [b.city, b.province].filter(Boolean).join(", ") || undefined,
                facilities: list,
            };
        });
        const loose = data.facilities.filter((f) => !assigned.has(f.id));
        if (loose.length > 0) result.push({ key: "unassigned", title: "Not assigned to a branch", facilities: loose });
        return result.filter((g) => g.facilities.length > 0);
    }, [data]);

    return (
        <div className="space-y-6">
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <IconServer className="h-5 w-5" /> Facilities &amp; Deployment
                    </CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        Every facility is its own service. Record whether it runs in the Clinic EZ shared cloud or on your own
                        server, and where its console lives. The clinic console keeps a local copy of the workspace profile, so
                        an on-premise clinic keeps its last synced branding if it cannot reach the cloud.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
                    {!isLoading && error && (
                        <p className="text-sm text-red-600">Facilities could not be loaded. Please refresh and try again.</p>
                    )}
                    {!isLoading && !error && groups.length === 0 && (
                        <p className="text-sm text-slate-500">No facilities yet. Create one from the workspace overview.</p>
                    )}
                    <div className="space-y-6">
                        {groups.map((g) => (
                            <section key={g.key} className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                                <h3 className="text-sm font-bold">{g.title}</h3>
                                {g.subtitle && <p className="text-xs text-slate-400 mb-3">{g.subtitle}</p>}
                                <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-3">
                                    {g.facilities.map((f) => (
                                        <FacilityRow
                                            key={`${f.id}:${f.deploymentMode}:${f.consoleBaseUrl}:${f.visibility}:${f.acceptsExternalRequests}`}
                                            tenantSlug={tenantSlug}
                                            facility={f}
                                            interopAvailable={interopAvailable}
                                            onSaved={() => mutate()}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
