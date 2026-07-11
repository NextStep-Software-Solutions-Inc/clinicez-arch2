import { Metadata } from "next";
import OrganizationTable from "@/components/dashboard/OrganizationTable";

export const metadata: Metadata = {
  title: "Partner Organizations | Clinic EZ Dashboard",
  description: "Manage partner organizations, hospital networks, healthcare providers, and external integrations.",
  keywords: ["organizations", "partner organizations", "hospital networks", "Clinic EZ organizations"],
};

export default function OrganizationsPage() {
    return (
        <div className="px-6 pt-4 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">My Partner Organizations</h1>
                <p className="text-lg text-gray-700">Manage your partner organizations here.</p>
            </div>
            <OrganizationTable />
        </div>
    );
}
