import { Metadata } from "next";
import { ChartAreaInteractive } from "@/components/dashboard/chart-area-interactive";
import { DataTable } from "@/components/dashboard/data-table";
import { SectionCards } from "@/components/dashboard/section-cards";
import data from "@/app/[tenant]/dashboard/data.json";

export const metadata: Metadata = {
  title: "Workspace Overview | Clinic EZ Workspace",
  description: "View tenant workspace analytics, clinical stats, and site reports in the Clinic EZ Workspace Console.",
  keywords: ["tenant workspace", "workspace overview", "health statistics", "Clinic EZ workspace"],
};

export default function OverviewPage() {
    return (
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards />
            <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
            </div>
            <DataTable data={data} />
        </div>
    );
}
