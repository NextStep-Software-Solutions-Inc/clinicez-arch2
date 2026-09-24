"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "@/transport/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
    IconCircleCheck, 
    IconClockPlay, 
    IconAlertCircle, 
    IconExternalLink, 
    IconPlus, 
    IconEdit, 
    IconTrash, 
    IconLoader 
} from "@tabler/icons-react";
import { toast } from "sonner";

interface Facility {
    id: string;
    name: string;
    facilityType: "Clinic" | "Laboratory" | "Pharmacy" | "Organization";
    status: "Provisioning" | "Active" | "Suspended" | "Failed";
    createdAt: string;
    slug?: string;
    consoleUrl?: string;
}

interface FacilityTableProps {
    facilityType: "Clinic" | "Laboratory" | "Pharmacy" | "Organization";
}

const DASHBOARD_PORTS = {
    Clinic: 5245,
    Laboratory: 5245,
    Pharmacy: 5245,
    Organization: 5245
};

export default function FacilityTable({ facilityType }: FacilityTableProps) {
    const params = useParams();
    const router = useRouter();
    const tenantSlug = params?.tenant as string;
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit Modal state
    const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
    const [editName, setEditName] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);

    // Delete Modal state
    const [deletingFacility, setDeletingFacility] = useState<Facility | null>(null);
    const [savingDelete, setSavingDelete] = useState(false);

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
        if (facility.consoleUrl) {
            window.open(facility.consoleUrl, "_blank");
            return;
        }

        const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
        if (isLocal) {
            const port = DASHBOARD_PORTS[facility.facilityType] || 5245;
            window.open(`http://localhost:${port}`, "_blank");
        } else {
            const slug = facility.slug || facility.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            window.open(`https://${slug}.clinicez.ph`, "_blank");
        }
    };

    const handleOpenEdit = (fac: Facility) => {
        setEditingFacility(fac);
        setEditName(fac.name);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingFacility || !editName.trim()) return;

        setSavingEdit(true);
        try {
            await apiClient.put(`/facilities/${editingFacility.id}`, {
                tenantSlug,
                name: editName.trim()
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

        setSavingDelete(true);
        try {
            await apiClient.delete(`/facilities/${deletingFacility.id}?tenantSlug=${tenantSlug}`);
            toast.success(`Removed "${deletingFacility.name}" from workspace`);
            setDeletingFacility(null);
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
                                        {fac.slug ? `${fac.slug}.clinicez.ph` : "Console"}
                                    </span>
                                </div>
                            </div>
                            <div className="shrink-0">
                                {renderStatusBadge(fac.status)}
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
                            <Button
                                onClick={() => handleOpenConsole(fac)}
                                disabled={fac.status !== "Active"}
                                variant="outline"
                                size="sm"
                                className="flex-1 rounded-xl text-xs font-bold h-9 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center justify-center gap-1.5"
                            >
                                <span>Manage Console</span>
                                <IconExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                onClick={() => handleOpenEdit(fac)}
                                variant="ghost"
                                size="sm"
                                title="Edit Facility"
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
                                                {fac.slug ? `${fac.slug}.clinicez.ph` : "Console"}
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
                                        {renderStatusBadge(fac.status)}
                                    </td>
                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                        <div className="inline-flex items-center gap-1.5 justify-end">
                                            <Button
                                                onClick={() => handleOpenConsole(fac)}
                                                disabled={fac.status !== "Active"}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl text-xs font-bold h-8 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                            >
                                                Manage Console
                                                <IconExternalLink className="h-3.5 w-3.5 ml-1.5" />
                                            </Button>
                                            <Button
                                                onClick={() => handleOpenEdit(fac)}
                                                variant="ghost"
                                                size="sm"
                                                title="Edit Facility"
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
                                className="h-9 text-xs rounded-xl"
                                required
                            />
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
                                disabled={savingEdit || !editName.trim()} 
                                className="w-full sm:w-auto rounded-xl text-xs font-semibold gap-1.5"
                            >
                                {savingEdit && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                                <span>Save Changes</span>
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Archive / Delete Facility Dialog */}
            <Dialog open={!!deletingFacility} onOpenChange={(open) => !open && setDeletingFacility(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-rose-600 dark:text-rose-400">
                            Archive {facilityType}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Are you sure you want to remove <strong className="text-slate-800 dark:text-slate-200">{deletingFacility?.name}</strong>? This action will unlink the clinical facility from your workspace.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 sm:justify-end">
                        <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => setDeletingFacility(null)} 
                            disabled={savingDelete}
                            className="w-full sm:w-auto rounded-xl text-xs"
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="button" 
                            variant="destructive" 
                            onClick={handleConfirmDelete} 
                            disabled={savingDelete}
                            className="w-full sm:w-auto rounded-xl text-xs font-semibold gap-1.5"
                        >
                            {savingDelete && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                            <span>Confirm &amp; Archive</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
