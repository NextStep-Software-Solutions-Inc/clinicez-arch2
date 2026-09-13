"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { apiClient } from "@/transport/apiClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconLoader, IconCircleCheck } from "@tabler/icons-react";

export default function CreateResourceDialog() {
    const searchParams = useSearchParams();
    const params = useParams();
    const router = useRouter();
    const type = searchParams.get("create") as "clinic" | "organization" | "laboratory" | "pharmacy" | null;
    const open = !!type;

    const tenantSlug = params?.tenant as string;

    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            const sp = new URLSearchParams(window.location.search);
            sp.delete("create");
            window.history.replaceState({}, "", `${window.location.pathname}?${sp}`);
            setName("");
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!type || !tenantSlug || !name.trim()) return;

        try {
            setLoading(true);
            const payload = {
                tenantId: tenantSlug,
                facilityType: type.charAt(0).toUpperCase() + type.slice(1),
                name: name.trim()
            };

            await apiClient.post("/facilities", payload);
            toast.success(`New ${type} "${name}" created and provisioning event published!`);
            handleOpenChange(false);
            
            // Refresh to update telemetry list
            router.refresh();
        } catch (err: any) {
            console.error(err);
            toast.error(err.response?.data?.message || err.message || `Failed to create ${type}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xl">
                <DialogHeader>
                    <DialogTitle className="capitalize text-lg font-black text-slate-800 dark:text-white">
                        Create New {type === "laboratory" ? "Laboratory" : type}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs font-medium">
                        Creates a new facility in the Tenant Workspace and publishes a provisioning event to the operational dashboards.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="resource-name" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Name of the {type}
                        </Label>
                        <Input
                            id="resource-name"
                            required
                            placeholder={`e.g. Metro ${type === "laboratory" ? "Lab" : type === "pharmacy" ? "Rx" : type}`}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="rounded-xl h-10 border-slate-200 dark:border-slate-800 bg-background text-sm font-semibold"
                        />
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            className="rounded-xl text-xs font-bold"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="rounded-xl text-xs font-bold px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {loading ? (
                                <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                            ) : (
                                <IconCircleCheck className="h-4 w-4 mr-1.5" />
                            )}
                            Create & Provision
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}