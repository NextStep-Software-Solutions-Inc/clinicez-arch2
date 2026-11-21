import { Suspense } from "react";
import { Metadata } from "next";
import { headers } from "next/headers";
import { TenantRegistrationClient } from "./_components/TenantRegistrationClient";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { tenantService } from "@/services/tenant.service";
import { getTenantWorkspaceUrl } from "@/utils/domain";
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
        const headerList = await headers();
        const host =
          headerList.get("x-forwarded-host")?.split(",")[0]?.trim() ||
          headerList.get("host") ||
          "";
        redirect(getTenantWorkspaceUrl(tenant.tenantSlug, "/dashboard", host));
      }
    }
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <TenantRegistrationClient />
    </Suspense>
  );
}
