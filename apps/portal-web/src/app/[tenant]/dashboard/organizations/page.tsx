import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import FacilityTable from "@/components/dashboard/FacilityTable";

export const metadata: Metadata = {
  title: "My Organizations | Clinic EZ Dashboard",
  description: "Manage partner organizations, hospital networks, healthcare providers, and external integrations.",
  keywords: ["organizations", "partner organizations", "hospital networks", "Clinic EZ organizations"],
};

export default function OrganizationsPage() {
    return (
        <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 md:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">My Organizations</h1>
                    <p className="text-muted-foreground text-xs sm:text-sm mt-1">Manage organization branches, hospital networks, healthcare providers, and external integrations.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <Link href="?create=organization" className="w-full sm:w-auto">
                        <Button className="w-full sm:w-auto rounded-xl font-bold text-xs px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center justify-center gap-1.5">
                            <IconPlus className="h-4 w-4" />
                            Create Organization
                        </Button>
                    </Link>
                </div>
            </div>

            <FacilityTable facilityType="Organization" />
        </div>
    );
}
