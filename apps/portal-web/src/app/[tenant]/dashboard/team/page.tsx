import { Metadata } from "next";
import TeamManagementClient from "./TeamManagementClient";

export const metadata: Metadata = {
  title: "Team & Staff | Clinic EZ Dashboard",
  description: "Manage clinical staff, role assignments, and workspace seat allocations in Clinic EZ.",
  keywords: ["team", "staff", "clinic staff", "Clinic EZ staff"],
};

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  return <TeamManagementClient tenantSlug={resolvedParams.tenant} />;
}
