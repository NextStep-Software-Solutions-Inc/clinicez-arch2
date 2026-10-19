import React from "react";
import type { Metadata } from "next";
import { queueDisplayService } from "@/services/queueDisplay.service";
import { tenantService } from "@/services/tenant.service";
import QueueDisplayClient from "@/components/queue-display/QueueDisplayClient";

interface QueueDisplayPageProps {
  params: Promise<{ tenantSlug: string; facilitySlug: string }>;
}

export async function generateMetadata({
  params,
}: QueueDisplayPageProps): Promise<Metadata> {
  const { tenantSlug, facilitySlug } = await params;
  return {
    title: `Waiting Area Queue Display | ${tenantSlug.toUpperCase()} (${facilitySlug})`,
    description: "Public Waiting Area TV Queue Display Board for Clinic EZ.",
  };
}

export default async function QueueDisplayPage({ params }: QueueDisplayPageProps) {
  const { tenantSlug, facilitySlug } = await params;

  // SSR initial fetch
  const res = await queueDisplayService.getDisplayData({
    tenantSlug,
    facilitySlug,
  });

  let logoUrl = res.data?.logoUrl || undefined;
  if (!logoUrl && tenantSlug) {
    const profile = await tenantService.getWorkspaceProfile(tenantSlug).catch(() => null);
    if (profile?.logoUrl) {
      logoUrl = profile.logoUrl;
    }
  }

  return (
    <QueueDisplayClient
      initialData={res.success ? res.data : undefined}
      tenantSlug={tenantSlug}
      facilitySlug={facilitySlug}
      logoUrl={logoUrl}
    />
  );
}
