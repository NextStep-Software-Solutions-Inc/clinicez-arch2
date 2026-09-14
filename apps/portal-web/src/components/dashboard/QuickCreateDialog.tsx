"use client";

import { Icon, IconBuilding, IconFlask, IconHospital, IconPill } from "@tabler/icons-react";
import { Card, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import Each from "../utils/Each";
import { useRef } from "react";

interface QuickCreateDialogProps {
    trigger: React.ReactNode;
}

const options: { value: "clinic" | "organization" | "laboratory" | "pharmacy"; label: string; icon: Icon }[] = [
    { value: "clinic", label: "Clinic", icon: IconHospital },
    { value: "organization", label: "Organization", icon: IconBuilding },
    { value: "laboratory", label: "Laboratory", icon: IconFlask },
    { value: "pharmacy", label: "Pharmacy", icon: IconPill }
];

export default function QuickCreateDialog({ trigger }: QuickCreateDialogProps) {

    const dialogRef = useRef<HTMLButtonElement>(null);

    const handleCreate = (type: "clinic" | "organization" | "laboratory" | "pharmacy") => {
        // Handle the creation logic here

        const searchParams = new URLSearchParams(window.location.search);
        searchParams.set("create", type);
        window.history.replaceState({}, "", `${window.location.pathname}?${searchParams}`);
        dialogRef.current?.click();
    }

    return (
        <Dialog>
            <DialogTrigger asChild ref={dialogRef}>{trigger}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>What do you want to create?</DialogTitle>
                    <DialogDescription>
                        Please select the type of resource you want to create.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-4">
                    <Each of={options} render={({ value, label, icon: Icon }) => (
                        <Card
                            onClick={() => handleCreate(value)}
                            className="group cursor-pointer border-2 border-border/60 hover:border-primary/50 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 hover:shadow-md active:ring-2 active:ring-primary active:scale-95 transition-all duration-200 ease-linear flex flex-col items-center justify-center p-4 sm:py-6 sm:px-2 rounded-2xl text-center"
                        >
                            <CardHeader className="flex flex-col items-center gap-2 p-0 w-full">
                                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 mb-1">
                                    <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-primary/80 group-hover:text-primary/90" />
                                </div>
                                <CardTitle className="text-sm sm:text-base font-semibold text-center group-hover:text-primary tracking-tight">
                                    {label}
                                </CardTitle>
                            </CardHeader>
                        </Card>
                    )} />
                </div>
            </DialogContent>
        </Dialog >
    );
}
