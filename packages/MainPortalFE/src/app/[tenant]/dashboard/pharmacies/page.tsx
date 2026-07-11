import { Metadata } from "next";
import PharmacyTable from "@/components/dashboard/PharmacyTable";

export const metadata: Metadata = {
  title: "My Pharmacies | Clinic EZ Dashboard",
  description: "Configure and manage pharmacy integrations, branches, and prescription pathways.",
  keywords: ["pharmacies", "pharmacy management", "clinic pharmacies", "Clinic EZ pharmacies"],
};

export default function PharmaciesPage() {
    return (
        <div className="px-6 pt-4 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">My Pharmacies</h1>
                <p className="text-lg text-gray-700">Manage your pharmacies here.</p>
            </div>
            <PharmacyTable />
        </div>
    );
}
