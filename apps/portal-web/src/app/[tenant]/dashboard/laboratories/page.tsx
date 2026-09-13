import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import FacilityTable from "@/components/dashboard/FacilityTable";

export const metadata: Metadata = {
  title: "My Laboratories | Clinic EZ Dashboard",
  description: "Manage clinical diagnostic laboratory branches, tests, and partnerships.",
  keywords: ["laboratories", "lab management", "clinic labs", "Clinic EZ laboratories"],
};

export default function LaboratoriesPage() {
    return (
        <div className="w-full flex-1 flex flex-col gap-8 p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">My Laboratories</h1>
                    <p className="text-muted-foreground mt-1">Manage partner laboratory networks, order records, and diagnostic settings.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <Link href="?create=laboratory">
                        <Button className="rounded-xl font-bold text-xs px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center gap-1.5">
                            <IconPlus className="h-4 w-4" />
                            Create Laboratory
                        </Button>
                    </Link>
                </div>
            </div>

            <FacilityTable facilityType="Laboratory" />
        </div>
    );
}
