import { redirect } from "next/navigation";

export default async function ClinicsRedirectPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}/dashboard/branches`);
}
