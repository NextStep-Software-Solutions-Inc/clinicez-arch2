import React from "react";
import type { Metadata } from "next";
import { joinService } from "@/services/join.service";
import JoinClient, { INSTITUTIONAL_CUSTOM_FIELDS } from "@/components/join/JoinClient";
import JoinCodeErrorCard from "@/components/join/JoinCodeErrorCard";

interface JoinCodePageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: JoinCodePageProps): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Clinic Intake (${code.toUpperCase()}) | Clinic EZ`,
    description: `Secured patient self-registration and intake workstation.`,
  };
}

export { INSTITUTIONAL_CUSTOM_FIELDS };

export default async function LockedJoinCodePage({ params }: JoinCodePageProps) {
  const { code } = await params;
  const cleanCode = (code || "").trim().toUpperCase();

  // Validate the join code directly against clinic-api
  const validation = await joinService.validateJoinCode(cleanCode);

  if (
    !validation.success ||
    !validation.tenantSlug ||
    !validation.facilitySlug
  ) {
    return (
      <JoinCodeErrorCard
        initialCode={cleanCode}
        errorMessage={validation.message || "Invalid or expired clinic join code."}
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
      initialJoinCode={cleanCode}
    />
  );
}
