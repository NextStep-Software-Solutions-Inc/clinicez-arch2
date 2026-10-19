import { Metadata } from "next";
import WorkspaceOverviewClient from "./WorkspaceOverviewClient";

export const metadata: Metadata = {
  title: "Workspace Overview | Clinic EZ Workspace",
  description: "View tenant workspace analytics, clinical stats, and site reports in the Clinic EZ Workspace Console.",
  keywords: ["tenant workspace", "workspace overview", "health statistics", "Clinic EZ workspace"],
};

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function OverviewPage({ params }: PageProps) {
  const resolvedParams = await params;
  const tenantSlug = resolvedParams.tenant;

  return <WorkspaceOverviewClient tenantSlug={tenantSlug} />;
}
