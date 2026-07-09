import PharmacyTable from "@/components/dashboard/PharmacyTable";

export default function LaboratoriesPage() {
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
