import { Metadata } from "next";
import TeamManagementClient from "./TeamManagementClient";

export const metadata: Metadata = {
  title: "Workspace Team | Clinic EZ Dashboard",
  description: "Manage workspace administrators, finance billers, and analysts in Clinic EZ.",
  keywords: ["team", "workspace team", "administrators", "Clinic EZ portal"],
};

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  return <TeamManagementClient tenantSlug={resolvedParams.tenant} />;
}
