import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { safeAwait } from "@shared/safe";
import { tenantService } from "@/services/tenant.service";
import OwnershipClient from "./OwnershipClient";

export const metadata: Metadata = {
  title: "Ownership | Clinic EZ Dashboard",
  description: "Hand the workspace to another member, or answer an ownership offer made to you.",
};

export default async function OwnershipPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { tenant: tenantSlug } = await params;
  const [token] = await safeAwait(getToken());
  const [tenant] = await safeAwait(tenantService.getTenantByOwner(userId, token, tenantSlug));

  return <OwnershipClient tenantSlug={tenantSlug} role={tenant?.role ?? "Member"} />;
}
