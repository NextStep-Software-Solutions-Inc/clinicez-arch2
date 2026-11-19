import { Metadata } from "next";
import BranchDetailClient from "@/components/dashboard/branches/BranchDetailClient";

export const metadata: Metadata = {
  title: "Branch Details | Clinic EZ Dashboard",
  description:
    "Manage a physical branch's facility roster, profile and location, and PhilHealth YAKAP credentials.",
};

export default function BranchDetailPage() {
  return <BranchDetailClient />;
}
