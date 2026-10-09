import { Metadata } from "next";
import NetworkClient from "./NetworkClient";

export const metadata: Metadata = {
  title: "Network | Clinic EZ Dashboard",
  description: "Find facilities in the ClinicEZ network, request links, and manage the links your facilities share.",
};

export default async function NetworkPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  return <NetworkClient tenantSlug={resolvedParams.tenant} />;
}
