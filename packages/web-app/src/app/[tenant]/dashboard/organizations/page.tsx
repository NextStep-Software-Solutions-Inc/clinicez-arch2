import OrganizationTable from "@/components/dashboard/OrganizationTable";

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
