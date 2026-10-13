import React from "react";
import type { Metadata } from "next";
import { tenantService } from "@/services/tenant.service";
import { facilityService } from "@/services/facility.service";
import JoinClient from "./JoinClient";

interface LockedJoinPageProps {
  params: Promise<{ tenantSlug: string; facilitySlug: string }>;
  searchParams: Promise<{ code?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string; facilitySlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug, facilitySlug } = await params;
  return {
    title: `Patient Pre-Registration - ${facilitySlug.toUpperCase()} | ClinicEZ`,
    description: `Secured public patient intake and pre-registration workstation for ${tenantSlug}.`,
  };
}

export default async function LockedJoinPage({
  params,
  searchParams,
}: LockedJoinPageProps) {
  const { tenantSlug, facilitySlug } = await params;
  const { code } = await searchParams;

  let tenantName = tenantSlug.toUpperCase();
  let facilityName = facilitySlug.replace(/-/g, " ").toUpperCase();
  let facilityAddress: string | undefined;

  try {
    const profile = await tenantService.getWorkspaceProfile(tenantSlug);
    if (profile?.displayName) {
      tenantName = profile.displayName;
    }
  } catch (_e) {
    // Graceful fallback
  }

  try {
    const facilities = await facilityService.getFacilities(tenantSlug);
    const facility = facilities?.find(
      (f) => f.slug.toLowerCase() === facilitySlug.toLowerCase()
    );
    if (facility) {
      facilityName = facility.name;
      facilityAddress = [
        facility.streetAddress,
        facility.barangay,
        facility.city,
        facility.province,
      ]
        .filter(Boolean)
        .join(", ");
    }
  } catch (_e) {
    // Graceful fallback
  }

  return (
    <JoinClient
      tenantSlug={tenantSlug}
      facilitySlug={facilitySlug}
      tenantName={tenantName}
      facilityName={facilityName}
      facilityAddress={facilityAddress}
      initialJoinCode={code}
    />
  );
}
