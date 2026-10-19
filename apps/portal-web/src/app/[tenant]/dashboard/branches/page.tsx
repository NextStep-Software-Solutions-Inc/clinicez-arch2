import { Metadata } from "next";
import BranchManagementClient from "@/components/dashboard/branches/BranchManagementClient";

export const metadata: Metadata = {
  title: "Branches & Locations | Clinic EZ Dashboard",
  description: "View, edit, and configure your multi-facility branches and statutory PhilHealth YAKAP accreditations.",
  keywords: ["branches", "clinic branches", "multi-branch", "PhilHealth YAKAP accreditation", "Clinic EZ branches"],
};

export default function BranchesPage() {
  return <BranchManagementClient />;
}
