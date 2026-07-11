import { Metadata } from "next";
import LaboratoryTable from "@/components/dashboard/LaboratoryTable";

export const metadata: Metadata = {
  title: "My Laboratories | Clinic EZ Dashboard",
  description: "Manage clinical diagnostic laboratory branches, tests, and partnerships.",
  keywords: ["laboratories", "lab management", "clinic labs", "Clinic EZ laboratories"],
};

export default function LaboratoriesPage() {
    return (
        <div className="px-6 pt-4 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">My Laboratories</h1>
                <p className="text-lg text-gray-700">Manage your laboratories here.</p>
            </div>
            <LaboratoryTable />
        </div>
    );
}
