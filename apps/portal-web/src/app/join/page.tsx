import React from "react";
import type { Metadata } from "next";
import { joinService } from "@/services/join.service";
import JoinClient from "@/components/join/JoinClient";
import JoinCodeErrorCard from "@/components/join/JoinCodeErrorCard";
import JoinLandingClient from "@/components/join/JoinLandingClient";

interface JoinPageProps {
  searchParams: Promise<{ code?: string; facility?: string }>;
}

export async function generateMetadata({ searchParams }: JoinPageProps): Promise<Metadata> {
  const { code } = (await searchParams) || {};
  if (code && code.trim()) {
    return {
      title: `Clinic Intake (${code.trim().toUpperCase()}) | Clinic EZ`,
      description: "Secured patient self-registration and intake workstation.",
    };
  }
  return {
    title: "Clinic Join | Clinic EZ",
    description: "Please enter your clinic's secured Join Passcode to begin patient intake.",
  };
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const { code, facility } = (await searchParams) || {};
  const cleanCode = (code || "").trim().toUpperCase();

  // If code is supplied via /join?code=CODE, validate server-side
  if (cleanCode) {
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

  // Otherwise, render landing code-entry experience
  return <JoinLandingClient initialFacility={facility} />;
}
