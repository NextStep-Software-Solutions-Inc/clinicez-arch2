import React from "react";
import type { Metadata } from "next";
import { joinService } from "@/services/join.service";
import JoinClient, { INSTITUTIONAL_CUSTOM_FIELDS } from "@/components/join/JoinClient";
import JoinCodeErrorCard from "@/components/join/JoinCodeErrorCard";

interface FacilityJoinPageProps {
  params: Promise<{ tenantSlug: string; facilitySlug: string }>;
}

export async function generateMetadata({
  params,
}: FacilityJoinPageProps): Promise<Metadata> {
  const { tenantSlug, facilitySlug } = await params;
  return {
    title: `Clinic Intake | ${facilitySlug.toUpperCase()} (${tenantSlug})`,
    description: `Secured patient self-registration and intake workstation for ${facilitySlug}.`,
  };
}

export { INSTITUTIONAL_CUSTOM_FIELDS };

export default async function FacilityJoinPage({ params }: FacilityJoinPageProps) {
  const { tenantSlug, facilitySlug } = await params;
  const cleanTenant = (tenantSlug || "").trim().toLowerCase();
  const cleanFacility = (facilitySlug || "").trim().toLowerCase();

  // Validate the facility intake directly against portal-api
  const validation = await joinService.getFacilityJoinData(cleanTenant, cleanFacility);

  if (
    !validation.success ||
    !validation.tenantSlug ||
    !validation.facilitySlug
  ) {
    return (
      <JoinCodeErrorCard
        initialCode={`${cleanTenant}/${cleanFacility}`}
        errorMessage={validation.message || "Invalid or disabled clinic registration intake."}
        errorCode={validation.errorCode}
        statusCode={validation.statusCode}
      />
    );
  }

  return (
    <JoinClient
      tenantSlug={validation.tenantSlug}
      facilitySlug={validation.facilitySlug}
      tenantName={validation.tenantName || validation.tenantSlug.toUpperCase()}
      facilityName={validation.facilityName || validation.facilitySlug.toUpperCase()}
      facilityAddress={validation.facilityAddress}
    />
  );
}
