import { Metadata } from "next";
import { TenantRegistrationClient } from "./_components/TenantRegistrationClient";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { tenantService } from "@/services/tenant.service";
import { safeAwait } from "@shared/safe";

export const metadata: Metadata = {
  title: "Setup Workplace | Clinic EZ",
  description: "Set up your entity or practice workplace in Clinic EZ.",
  keywords: ["workplace setup", "create Clinic EZ workspace", "healthcare practice setup"],
};

export default async function TenantRegistrationPage() {
  const { userId, getToken } = await auth();

  if (userId) {
    const [token] = await safeAwait(getToken());
    if (token) {
      const [tenant] = await safeAwait(tenantService.getTenantByOwner(userId, token));
      if (tenant && tenant.tenantSlug) {
        redirect(`/${tenant.tenantSlug}/dashboard`);
      }
    }
  }

  return <TenantRegistrationClient />;
}
