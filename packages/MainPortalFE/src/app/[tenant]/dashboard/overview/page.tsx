import { Metadata } from "next";
import { ChartAreaInteractive } from "@/components/dashboard/chart-area-interactive";
import { DataTable } from "@/components/dashboard/data-table";
import { SectionCards } from "@/components/dashboard/section-cards";
import data from "@/app/[tenant]/dashboard/data.json";

export const metadata: Metadata = {
  title: "Dashboard Overview | Clinic EZ",
  description: "View clinic analytics, statistics, patient admissions, and reports in the Clinic EZ Dashboard.",
  keywords: ["clinic dashboard", "health statistics", "patient analytics", "Clinic EZ dashboard"],
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
