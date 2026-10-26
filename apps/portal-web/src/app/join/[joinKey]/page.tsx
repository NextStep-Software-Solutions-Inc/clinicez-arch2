import React from "react";
import type { Metadata } from "next";
import { joinService } from "@/services/join.service";
import JoinClient, { INSTITUTIONAL_CUSTOM_FIELDS } from "@/components/join/JoinClient";
import JoinCodeErrorCard from "@/components/join/JoinCodeErrorCard";

interface JoinCodePageProps {
  // Next.js allows one slug name per dynamic level. `[joinKey]` is shared with
  // `join/[joinKey]/[facilitySlug]`, where it is the tenant slug; here it is the join code.
  params: Promise<{ joinKey: string }>;
}

export async function generateMetadata({
  params,
}: JoinCodePageProps): Promise<Metadata> {
  const { joinKey: code } = await params;
  return {
    title: `Clinic Intake (${code.toUpperCase()}) | Clinic EZ`,
    description: `Secured patient self-registration and intake workstation.`,
  };
}

export { INSTITUTIONAL_CUSTOM_FIELDS };

export default async function LockedJoinCodePage({ params }: JoinCodePageProps) {
  const { joinKey: code } = await params;
  const cleanCode = (code || "").trim().toUpperCase();

  // Validate the join code directly against portal-api
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
      initialJoinCode={cleanCode}
    />
  );
}
