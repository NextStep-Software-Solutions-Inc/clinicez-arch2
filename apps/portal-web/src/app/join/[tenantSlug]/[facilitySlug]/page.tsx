import React from "react";
import type { Metadata } from "next";
import { joinService } from "@/services/join.service";
import JoinClient from "@/components/join/JoinClient";
import JoinCodeErrorCard from "@/components/join/JoinCodeErrorCard";

interface FacilityJoinPageProps {
  params: Promise<{ tenantSlug: string; facilitySlug: string }>;
  searchParams?: Promise<{ code?: string }>;
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

export default async function FacilityJoinPage({
  params,
  searchParams,
}: FacilityJoinPageProps) {
  const { tenantSlug, facilitySlug } = await params;
  const search = searchParams ? await searchParams : {};
  const cleanTenant = (tenantSlug || "").trim().toLowerCase();
  const cleanFacility = (facilitySlug || "").trim().toLowerCase();
  const initialCode = search.code?.trim().toUpperCase();

  // Validate facility intake directly against portal-api
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
      initialJoinCode={initialCode}
    />
  );
}
