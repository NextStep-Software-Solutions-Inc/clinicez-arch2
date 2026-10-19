"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "@/transport/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
    IconCircleCheck, 
    IconClockPlay, 
    IconAlertCircle, 
    IconAlertTriangle,
    IconExternalLink, 
    IconPlus, 
    IconEdit, 
    IconTrash, 
    IconLoader,
    IconSettings
} from "@tabler/icons-react";
import { toast } from "sonner";
import FacilitySettingsHub, { FacilityData } from "./FacilitySettingsHub";
import { getConsoleBaseDomain } from "@/utils/domain";
import { APP_SUBDOMAINS } from "@/config/site";

type Facility = FacilityData;

interface FacilityTableProps {
    facilityType: "Clinic" | "Laboratory" | "Pharmacy" | "Organization";
}

const DASHBOARD_PORTS: Record<string, number> = {
    Clinic: 8081,
    Laboratory: 8082,
    Pharmacy: 8083,
    Organization: 8084
};

function getFacilityDomain(fac: Facility, tenantSlug: string) {
    if (fac.consoleUrl) {
        try {
            return new URL(fac.consoleUrl).host;
        } catch {
            // fallback
        }
    }
    const baseDomain = getConsoleBaseDomain();
    const sub = APP_SUBDOMAINS[fac.facilityType] || "clinic";
    const targetSlug = fac.slug || tenantSlug;
    return `${targetSlug}.${sub}.${baseDomain}`;
}

export default function FacilityTable({ facilityType }: FacilityTableProps) {
    const params = useParams();
    const router = useRouter();
    const tenantSlug = params?.tenant as string;
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit Modal state
    const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
    const [editName, setEditName] = useState("");
    const [editSlug, setEditSlug] = useState("");
    const [editStatus, setEditStatus] = useState<Facility["status"]>("Active");
    const [savingEdit, setSavingEdit] = useState(false);

    // Settings Hub state
    const [settingsFacility, setSettingsFacility] = useState<FacilityData | null>(null);

    // Activation state
    const [activatingId, setActivatingId] = useState<string | null>(null);

    // Delete Modal state
    const [deletingFacility, setDeletingFacility] = useState<Facility | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
    const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
    const [savingDelete, setSavingDelete] = useState(false);

    const handleActivateFacility = async (fac: Facility) => {
        setActivatingId(fac.id);
        try {
            await apiClient.post(`/facilities/${fac.id}/activate?tenantSlug=${tenantSlug}`);
            toast.success(`"${fac.name}" activated and provisioned successfully!`);
            fetchFacilities();
        } catch (err: any) {
            try {
                await apiClient.put(`/facilities/${fac.id}`, {
                    tenantSlug,
                    name: fac.name,
                    status: "Active"
                });
                toast.success(`"${fac.name}" activated successfully!`);
                fetchFacilities();
            } catch (fallbackErr: any) {
                toast.error(err.response?.data?.message || err.message || "Failed to activate facility");
            }
        } finally {
            setActivatingId(null);
        }
    };

    const fetchFacilities = async () => {
        try {
            const response = await apiClient.get<Facility[]>(`/facilities?tenantSlug=${tenantSlug}`);
            const filtered = (response.data || []).filter(f => f.facilityType === facilityType);
            setFacilities(filtered);
        } catch (err) {
            console.error("Failed to load facilities", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFacilities();
        
        const interval = setInterval(fetchFacilities, 5000);
        return () => clearInterval(interval);
    }, [tenantSlug, facilityType]);

    const handleOpenConsole = (facility: Facility) => {
        if (facility.status !== "Active") return;

        if (facility.consoleUrl) {
            window.open(facility.consoleUrl, "_blank");
            return;
        }

        const baseDomain = getConsoleBaseDomain();
        if (baseDomain) {
            const sub = APP_SUBDOMAINS[facility.facilityType] || "clinic";
            const targetSlug = facility.slug || tenantSlug;
            window.open(`https://${targetSlug}.${sub}.${baseDomain}`, "_blank");
            return;
        }

        const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
        if (isLocal) {
            const port = DASHBOARD_PORTS[facility.facilityType] || 8081;
            window.open(`http://localhost:${port}?tenant=${tenantSlug}`, "_blank");
        }
    };

    const handleOpenEdit = (fac: Facility) => {
        setEditingFacility(fac);
        setEditName(fac.name);
        setEditSlug(fac.slug || "");
        setEditStatus(fac.status);
    };

    const isEditDuplicate = facilities.some(
        (f) => f.id !== editingFacility?.id && f.name.trim().toLowerCase() === editName.trim().toLowerCase()
    );

    const isEditDuplicateSlug = facilities.some(
        (f) => f.id !== editingFacility?.id && !!f.slug && !!editSlug.trim() && f.slug.trim().toLowerCase() === editSlug.trim().toLowerCase()
    );

    const isEditSlugInvalid = !!editSlug.trim() && (
        editSlug.trim().length < 2 ||
        editSlug.trim().length > 63 ||
        !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(editSlug.trim())
    );

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingFacility || !editName.trim()) return;

        if (isEditDuplicate) {
            toast.error(`A facility named "${editName.trim()}" already exists in this workspace.`);
            return;
        }

        if (isEditDuplicateSlug) {
            toast.error(`A facility with slug "${editSlug.trim()}" already exists in this workspace.`);
            return;
        }

        if (isEditSlugInvalid) {
            toast.error("Facility slug must be between 2 and 63 lowercase alphanumeric characters or hyphens.");
            return;
        }

        setSavingEdit(true);
        try {
            await apiClient.put(`/facilities/${editingFacility.id}`, {
                tenantSlug,
                name: editName.trim(),
                slug: editSlug.trim() || undefined,
                status: editStatus
            });
            toast.success("Facility updated successfully");
            setEditingFacility(null);
            fetchFacilities();
        } catch (err: any) {
            toast.error(err.response?.data?.message || err.message || "Failed to update facility");
        } finally {
            setSavingEdit(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingFacility) return;
        if (deleteConfirmationText.trim() !== deletingFacility.name.trim() || !deleteAcknowledged) {
            toast.error("Please type the exact facility name and acknowledge the operational impact to confirm.");
            return;
        }

        setSavingDelete(true);
        try {
            await apiClient.delete(`/facilities/${deletingFacility.id}?tenantSlug=${tenantSlug}`);
            toast.success(`"${deletingFacility.name}" archived successfully`);
            setDeletingFacility(null);
            setDeleteConfirmationText("");
            setDeleteAcknowledged(false);
            fetchFacilities();
        } catch (err: any) {
            toast.error(err.response?.data?.message || err.message || "Failed to delete facility");
        } finally {
            setSavingDelete(false);
        }
    };

    const renderStatusBadge = (status: Facility["status"]) => {
        switch (status) {
            case "Provisioning":
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 animate-pulse border border-amber-100 dark:border-amber-900/30 whitespace-nowrap">
                        <IconClockPlay className="h-3.5 w-3.5 shrink-0" />
                        Provisioning
                    </span>
                );
            case "Active":
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 whitespace-nowrap">
                        <IconCircleCheck className="h-3.5 w-3.5 shrink-0" />
                        Active
                    </span>
                );
            case "Failed":
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 whitespace-nowrap">
                        <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Failed
                    </span>
                );
            case "Suspended":
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800 whitespace-nowrap">
                        <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Suspended
                    </span>
                );
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="w-full space-y-3 mt-4">
                {[1, 2, 3].map((n) => (
                    <div key={n} className="h-24 md:h-16 w-full rounded-2xl bg-slate-50 dark:bg-slate-900 animate-pulse border border-slate-100 dark:border-slate-800" />
                ))}
            </div>
        );
    }

    if (facilities.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-12 mt-4 bg-slate-50/50 dark:bg-slate-900/35 text-center">
                <div className="p-4 bg-primary/10 rounded-full text-primary mb-4 animate-bounce">
                    <IconPlus className="h-8 w-8" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200">No {facilityType}s Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm text-center mt-1.5 font-medium leading-relaxed">
                    You haven't provisioned any {facilityType.toLowerCase()}s for this workspace yet. Create one to get started.
                </p>
                <Button 
                    onClick={() => router.push(`?create=${facilityType.toLowerCase()}`)} 
                    className="mt-5 rounded-xl font-bold text-xs px-5 bg-primary text-primary-foreground hover:bg-primary/95"
                >
                    Create & Provision
                </Button>
            </div>
        );
    }

    return (
        <>
            {/* Mobile View: Dedicated cards (< md) */}
            <div className="block md:hidden space-y-3.5 mt-2">
                {facilities.map((fac) => (
                    <div
                        key={fac.id}
                        className="p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xs flex flex-col gap-3.5"
                    >
                        {/* Top: Facility Name & Status Badge */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 truncate">
                                    {fac.name}
                                </h3>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-0.5 flex-wrap">
                                    <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 dark:text-slate-500">
                                        {fac.facilityType}
                                    </span>
                                    <span>•</span>
                                    <span className="font-mono text-[11px] text-primary/85 dark:text-primary/75 truncate">
                                        {getFacilityDomain(fac, tenantSlug)}
                                    </span>
                                </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                                {renderStatusBadge(fac.status)}
                                {fac.isPatientDiscoveryEligible ? (
                                    <Badge variant="outline" className="text-[10px] font-bold bg-primary/10 text-primary border-primary/20">
                                        Directory Eligible
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700">
                                        Draft / Private
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {/* Middle: Created At date */}
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Created</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                                {new Date(fac.createdAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </span>
                        </div>

                        {/* Bottom: Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                            {fac.status === "Provisioning" ? (
                                <Button
                                    onClick={() => handleActivateFacility(fac)}
                                    disabled={activatingId === fac.id}
                                    variant="outline"
                                    size="sm"
                                    title="Provisioning in progress. Tap to force activate if taking too long."
                                    className="flex-1 rounded-xl text-xs font-bold h-9 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 hover:text-amber-800 flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                                >
                                    {activatingId === fac.id ? (
                                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <IconClockPlay className="h-3.5 w-3.5 animate-spin" />
                                    )}
                                    <span>Activate Facility</span>
                                </Button>
                            ) : fac.status === "Active" ? (
                                <Button
                                    onClick={() => handleOpenConsole(fac)}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 rounded-xl text-xs font-bold h-9 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center justify-center gap-1.5"
                                >
                                    <span>Manage Console</span>
                                    <IconExternalLink className="h-3.5 w-3.5" />
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => handleActivateFacility(fac)}
                                    disabled={activatingId === fac.id}
                                    variant="default"
                                    size="sm"
                                    className="flex-1 rounded-xl text-xs font-bold h-9 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                    {activatingId === fac.id ? (
                                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <IconCircleCheck className="h-3.5 w-3.5" />
                                    )}
                                    <span>Activate Now</span>
                                </Button>
                            )}
                            <Button
                                onClick={() => setSettingsFacility(fac)}
                                variant="ghost"
                                size="sm"
                                title="Facility Settings"
                                className="rounded-xl h-9 w-9 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                            >
                                <IconSettings className="h-4 w-4" />
                            </Button>
                            <Button
                                onClick={() => handleOpenEdit(fac)}
                                variant="ghost"
                                size="sm"
                                title="Quick Edit Name/Status"
                                className="rounded-xl h-9 w-9 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                            >
                                <IconEdit className="h-4 w-4" />
                            </Button>
                            <Button
                                onClick={() => setDeletingFacility(fac)}
                                variant="ghost"
                                size="sm"
                                title="Archive Facility"
                                className="rounded-xl h-9 w-9 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                            >
                                <IconTrash className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop View: Full Table (>= md) */}
            <div className="hidden md:block w-full overflow-hidden border border-slate-100 dark:border-slate-800 rounded-3xl mt-4 shadow-sm bg-white dark:bg-slate-950">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/50">
                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Name</th>
                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Created At</th>
                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Status</th>
                                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {facilities.map((fac) => (
                                <tr key={fac.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-800 dark:text-slate-100">{fac.name}</div>
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mt-0.5">
                                            <span className="font-bold uppercase tracking-wider text-[10px]">{fac.facilityType}</span>
                                            <span>•</span>
                                            <span className="font-mono text-[11px] text-primary/85 dark:text-primary/75">
                                                {getFacilityDomain(fac, tenantSlug)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                                        {new Date(fac.createdAt).toLocaleDateString(undefined, {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {renderStatusBadge(fac.status)}
                                            {fac.isPatientDiscoveryEligible ? (
                                                <Badge variant="outline" className="text-[10px] font-bold bg-primary/10 text-primary border-primary/20">
                                                    Directory Eligible
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700">
                                                    Draft / Private
                                                </Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                        <div className="inline-flex items-center gap-1.5 justify-end">
                                            {fac.status === "Provisioning" ? (
                                                <Button
                                                    onClick={() => handleActivateFacility(fac)}
                                                    disabled={activatingId === fac.id}
                                                    variant="outline"
                                                    size="sm"
                                                    title="Provisioning in progress. Click to force activate if taking too long."
                                                    className="rounded-xl text-xs font-bold h-8 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 hover:text-amber-800 gap-1.5 transition-colors"
                                                >
                                                    {activatingId === fac.id ? (
                                                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <IconClockPlay className="h-3.5 w-3.5 animate-spin" />
                                                    )}
                                                    <span>Activate Facility</span>
                                                </Button>
                                            ) : fac.status === "Active" ? (
                                                <Button
                                                    onClick={() => handleOpenConsole(fac)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-xl text-xs font-bold h-8 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                                >
                                                    Manage Console
                                                    <IconExternalLink className="h-3.5 w-3.5 ml-1.5" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    onClick={() => handleActivateFacility(fac)}
                                                    disabled={activatingId === fac.id}
                                                    variant="default"
                                                    size="sm"
                                                    className="rounded-xl text-xs font-bold h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                                                >
                                                    {activatingId === fac.id ? (
                                                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <IconCircleCheck className="h-3.5 w-3.5" />
                                                    )}
                                                    <span>Activate Now</span>
                                                </Button>
                                            )}
                                            <Button
                                                onClick={() => setSettingsFacility(fac)}
                                                variant="ghost"
                                                size="sm"
                                                title="Facility Settings"
                                                className="rounded-xl h-8 w-8 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                                            >
                                                <IconSettings className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                onClick={() => handleOpenEdit(fac)}
                                                variant="ghost"
                                                size="sm"
                                                title="Quick Edit Name/Status"
                                                className="rounded-xl h-8 w-8 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                                            >
                                                <IconEdit className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                onClick={() => setDeletingFacility(fac)}
                                                variant="ghost"
                                                size="sm"
                                                title="Archive Facility"
                                                className="rounded-xl h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                            >
                                                <IconTrash className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Facility Dialog */}
            <Dialog open={!!editingFacility} onOpenChange={(open) => !open && setEditingFacility(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold">Edit {facilityType}</DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Update the name or configuration for this clinical location.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="editName" className="text-xs font-bold">Facility Name</Label>
                            <Input
                                id="editName"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="e.g. Metro Clinic Makati"
                                className={`h-9 text-xs rounded-xl ${
                                    isEditDuplicate ? "border-rose-500 focus-visible:ring-rose-500 bg-rose-50/20" : ""
                                }`}
                                required
                            />
                            {isEditDuplicate && (
                                <p className="text-xs text-rose-500 font-semibold flex items-center gap-1 mt-1 animate-in fade-in-50">
                                    <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    A facility named &ldquo;{editName.trim()}&rdquo; already exists in this workspace.
                                </p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="editSlug" className="text-xs font-bold">Facility Subdomain / URL Slug</Label>
                                <span className="text-[10px] text-slate-400 font-mono">Unique subdomain</span>
                            </div>
                            <Input
                                id="editSlug"
                                value={editSlug}
                                onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                placeholder="e.g. metro-makati"
                                className={`h-9 text-xs font-mono rounded-xl ${
                                    isEditDuplicateSlug || isEditSlugInvalid ? "border-rose-500 focus-visible:ring-rose-500 bg-rose-50/20" : ""
                                }`}
                            />
                            {isEditDuplicateSlug && (
                                <p className="text-xs text-rose-500 font-semibold flex items-center gap-1 mt-1 animate-in fade-in-50">
                                    <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    Slug &ldquo;{editSlug.trim()}&rdquo; is already taken in this workspace.
                                </p>
                            )}
                            {isEditSlugInvalid && (
                                <p className="text-xs text-rose-500 font-semibold flex items-center gap-1 mt-1 animate-in fade-in-50">
                                    <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    Slug must be 2-63 characters, lowercase letters, numbers, and hyphens only (cannot start or end with a hyphen).
                                </p>
                            )}
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-2.5 flex items-center gap-2">
                                <span className="text-[11px] text-slate-400 font-semibold">Live Preview:</span>
                                <span className="font-mono text-xs text-primary font-bold truncate">
                                    {`https://${editSlug.trim() || "slug"}.${APP_SUBDOMAINS[editingFacility?.facilityType || facilityType] || "clinic"}.${getConsoleBaseDomain()}`}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="editStatus" className="text-xs font-bold">Operational Status</Label>
                            <select
                                id="editStatus"
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as Facility["status"])}
                                className="w-full h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-background px-3 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value="Active">Active</option>
                                <option value="Provisioning">Provisioning</option>
                                <option value="Suspended">Suspended</option>
                                <option value="Failed">Failed</option>
                            </select>
                        </div>
                        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setEditingFacility(null)} 
                                disabled={savingEdit}
                                className="w-full sm:w-auto rounded-xl text-xs"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={savingEdit || !editName.trim() || isEditDuplicate || isEditDuplicateSlug || isEditSlugInvalid} 
                                className="w-full sm:w-auto rounded-xl text-xs font-semibold gap-1.5"
                            >
                                {savingEdit && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                                <span>Save Changes</span>
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Hardened Intentional Archive / Delete Facility Dialog */}
            <Dialog open={!!deletingFacility} onOpenChange={(open) => {
                if (!open) {
                    setDeletingFacility(null);
                    setDeleteConfirmationText("");
                    setDeleteAcknowledged(false);
                }
            }}>
                <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-lg rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-950">
                    <DialogHeader>
                        <DialogTitle className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                            <IconAlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                            <span>Archive &amp; Decommission {facilityType}</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500 leading-relaxed mt-1">
                            This action immediately revokes access, unlinks custom domains, and halts all terminal operations.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Operational Impact Warning Callout */}
                    <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-2 text-xs text-rose-900 dark:text-rose-200">
                        <div className="font-bold flex items-center gap-1.5">
                            <IconAlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                            <span>Immediate Operational Impact:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-800 dark:text-rose-300">
                            <li>The domain <strong className="font-mono">{deletingFacility ? getFacilityDomain(deletingFacility, tenantSlug) : ""}</strong> will stop resolving.</li>
                            <li>Active workstation logins, doctor consultation queues, and cashier sessions will be disconnected.</li>
                            <li>Cryptographic license token will be deactivated on the root licensing ledger.</li>
                            <li>Patient audit trails are securely retained in compliance with Philippine health records retention law.</li>
                        </ul>
                    </div>

                    {/* Exact Name Verification Input */}
                    <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            To confirm deactivation, please type <span className="font-bold select-all font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200/60 dark:border-rose-900/40">{deletingFacility?.name}</span> below:
                        </Label>
                        <Input
                            value={deleteConfirmationText}
                            onChange={(e) => setDeleteConfirmationText(e.target.value)}
                            placeholder={deletingFacility?.name}
                            className="h-9 text-xs rounded-xl font-medium focus-visible:ring-rose-500"
                            autoComplete="off"
                        />
                    </div>

                    {/* Intentional Checkbox Gate */}
                    <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={deleteAcknowledged}
                            onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                            className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-tight">
                            I understand that archiving <strong className="text-slate-900 dark:text-slate-100">{deletingFacility?.name}</strong> will immediately halt clinical operations and cannot be undone with a single click.
                        </span>
                    </label>

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
                        <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                                setDeletingFacility(null);
                                setDeleteConfirmationText("");
                                setDeleteAcknowledged(false);
                            }} 
                            disabled={savingDelete}
                            className="w-full sm:w-auto rounded-xl text-xs font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="button" 
                            variant="destructive" 
                            onClick={handleConfirmDelete} 
                            disabled={
                                savingDelete || 
                                deleteConfirmationText.trim() !== deletingFacility?.name.trim() || 
                                !deleteAcknowledged
                            }
                            className="w-full sm:w-auto rounded-xl text-xs font-semibold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {savingDelete && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                            <span>Permanently Archive Facility</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Facility Settings Hub */}
            <FacilitySettingsHub
                facility={settingsFacility}
                open={!!settingsFacility}
                onOpenChange={(open) => !open && setSettingsFacility(null)}
                onSaved={fetchFacilities}
            />
        </>
    );
}
