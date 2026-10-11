import { Metadata } from "next";
import FinanceClient from "./FinanceClient";

export const metadata: Metadata = {
  title: "Finance | Clinic EZ Dashboard",
  description: "Collected, reversed and net revenue across your facilities and branches, as totals only.",
};

export default async function FinancePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  return <FinanceClient tenantSlug={resolvedParams.tenant} />;
}
