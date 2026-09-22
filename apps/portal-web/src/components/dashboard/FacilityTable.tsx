"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "@/transport/apiClient";
import { Button } from "@/components/ui/button";
import { IconCircleCheck, IconClockPlay, IconAlertCircle, IconExternalLink, IconPlus } from "@tabler/icons-react";

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
    Laboratory: 5245, // Map to dev dashboard ports as applicable
    Pharmacy: 5245,
    Organization: 5245
};

export default function FacilityTable({ facilityType }: FacilityTableProps) {
    const params = useParams();
    const router = useRouter();
    const tenantSlug = params?.tenant as string;
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFacilities = async () => {
        try {
            const response = await apiClient.get<Facility[]>(`/facilities?tenantSlug=${tenantSlug}`);
            // Filter by relevant type
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
        
        // Auto refresh every 5 seconds to track provisioning status
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

    if (loading) {
        return (
            <div className="w-full space-y-3 mt-4">
                {[1, 2, 3].map((n) => (
                    <div key={n} className="h-16 w-full rounded-2xl bg-slate-50 dark:bg-slate-900 animate-pulse border border-slate-100 dark:border-slate-800" />
                ))}
            </div>
        );
    }

    if (facilities.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 mt-4 bg-slate-50/50 dark:bg-slate-900/35">
                <div className="p-4 bg-primary/10 rounded-full text-primary mb-4 animate-bounce">
                    <IconPlus className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">No {facilityType}s Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm text-center mt-1.5 font-medium">
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
        <div className="w-full overflow-hidden border border-slate-100 dark:border-slate-800 rounded-3xl mt-4 shadow-sm bg-white dark:bg-slate-950">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/50">
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Name</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Created At</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Status</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Actions</th>
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
                            <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
                                {new Date(fac.createdAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </td>
                            <td className="px-6 py-4">
                                {fac.status === "Provisioning" && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 animate-pulse border border-amber-100 dark:border-amber-900/30">
                                        <IconClockPlay className="h-3.5 w-3.5" />
                                        Provisioning
                                    </span>
                                )}
                                {fac.status === "Active" && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                                        <IconCircleCheck className="h-3.5 w-3.5" />
                                        Active
                                    </span>
                                )}
                                {fac.status === "Failed" && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30">
                                        <IconAlertCircle className="h-3.5 w-3.5" />
                                        Failed
                                    </span>
                                )}
                                {fac.status === "Suspended" && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
                                        <IconAlertCircle className="h-3.5 w-3.5" />
                                        Suspended
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <Button
                                    onClick={() => handleOpenConsole(fac)}
                                    disabled={fac.status !== "Active"}
                                    variant="outline"
                                    className="rounded-xl text-xs font-bold h-8 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                >
                                    Manage Console
                                    <IconExternalLink className="h-3.5 w-3.5 ml-1.5" />
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
