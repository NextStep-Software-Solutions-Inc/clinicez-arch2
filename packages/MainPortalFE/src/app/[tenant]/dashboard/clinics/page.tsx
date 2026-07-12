import { Metadata } from "next";
import ClinicTable from "@/components/dashboard/ClinicTable";

export const metadata: Metadata = {
  title: "My Clinics | Clinic EZ Dashboard",
  description: "View, edit, and configure your clinic locations and settings in Clinic EZ.",
  keywords: ["my clinics", "clinic management", "clinic locations", "Clinic EZ clinics"],
};

export default function ClinicsPage() {
    return (
        <div className="px-6 pt-4 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">My Clinics</h1>
                <p className="text-lg text-gray-700">Manage your clinics here.</p>
            </div>
            <ClinicTable />
        </div>
    );
}
