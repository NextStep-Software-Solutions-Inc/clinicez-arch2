import { Metadata } from "next";
import PlanClient from "./PlanClient";

export const metadata: Metadata = {
  title: "Plan & Usage | Clinic EZ Dashboard",
  description: "Your workspace plan, what it includes, how much of each limit you use, and how facilities share the workspace pools.",
};

export default async function PlanPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  return <PlanClient tenantSlug={resolvedParams.tenant} />;
}
