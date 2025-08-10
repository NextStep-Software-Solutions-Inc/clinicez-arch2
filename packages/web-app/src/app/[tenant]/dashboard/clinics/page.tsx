import ClinicTable from "@/components/dashboard/ClinicTable";

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
