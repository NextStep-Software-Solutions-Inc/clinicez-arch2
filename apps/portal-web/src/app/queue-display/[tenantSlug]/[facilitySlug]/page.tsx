import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queueDisplayService } from "@/services/queueDisplay.service";
import { tenantService } from "@/services/tenant.service";
import QueueDisplayClient from "@/components/queue-display/QueueDisplayClient";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGuid = (val?: string | null): boolean =>
  Boolean(val && UUID_REGEX.test(val.trim()));

interface QueueDisplayPageProps {
  params: Promise<{ tenantSlug: string; facilitySlug: string }>;
  searchParams?: Promise<{ pin?: string }>;
}

export async function generateMetadata({
  params,
}: QueueDisplayPageProps): Promise<Metadata> {
  const { tenantSlug, facilitySlug } = await params;
  if (isGuid(tenantSlug) || isGuid(facilitySlug)) {
    return {
      title: "Queue Display Not Found | Clinic EZ",
    };
  }

  return {
    title: `Waiting Area Queue Display | ${tenantSlug.toUpperCase()} (${facilitySlug})`,
    description: "Public Waiting Area TV Queue Display Board for Clinic EZ.",
  };
}

export default async function QueueDisplayPage({ params, searchParams }: QueueDisplayPageProps) {
  const { tenantSlug, facilitySlug } = await params;

  // Strict invariant: UUIDs cannot be resolved into public display boards -> 404
  if (isGuid(tenantSlug) || isGuid(facilitySlug)) {
    notFound();
  }

  const sp = searchParams ? await searchParams : {};
  const initialPin = sp.pin;

  // SSR initial fetch
  const res = await queueDisplayService.getDisplayData({
    tenantSlug,
    facilitySlug,
    pin: initialPin,
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
      initialPin={initialPin}
    />
  );
}
