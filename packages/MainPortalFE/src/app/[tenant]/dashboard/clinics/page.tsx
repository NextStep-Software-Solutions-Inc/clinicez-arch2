import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import FacilityTable from "@/components/dashboard/FacilityTable";

export const metadata: Metadata = {
  title: "My Clinics | Clinic EZ Dashboard",
  description: "View, edit, and configure your clinic locations and settings in Clinic EZ.",
  keywords: ["my clinics", "clinic management", "clinic locations", "Clinic EZ clinics"],
};

export default function ClinicsPage() {
    return (
        <div className="w-full flex-1 flex flex-col gap-8 p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">My Clinics</h1>
                    <p className="text-muted-foreground mt-1">Manage and provision clinic locations, settings, and console redirection.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <Link href="?create=clinic">
                        <Button className="rounded-xl font-bold text-xs px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center gap-1.5">
                            <IconPlus className="h-4 w-4" />
                            Create Clinic
                        </Button>
                    </Link>
                </div>
            </div>

            <FacilityTable facilityType="Clinic" />
        </div>
    );
}
