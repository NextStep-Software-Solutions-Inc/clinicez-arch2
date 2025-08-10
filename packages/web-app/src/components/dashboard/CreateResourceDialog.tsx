"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSearchParams } from "next/navigation";

export default function CreateResourceDialog() {
    const type = useSearchParams().get("create") as "clinic" | "organization" | "laboratory" | "pharmacy" | null;
    const open = !!type;

    const handleOpenChange = (open: boolean) => {
        // delete query param "create"
        if (!open) {
            const searchParams = new URLSearchParams(window.location.search);
            searchParams.delete("create");
            window.history.replaceState({}, "", `${window.location.pathname}?${searchParams}`);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create a new {type}</DialogTitle>
                    <DialogDescription>
                        Please fill in the details for the new {type}.
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}