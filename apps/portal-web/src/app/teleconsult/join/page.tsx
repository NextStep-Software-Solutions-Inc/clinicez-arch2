import React from "react";
import { TeleconsultGuestFlow } from "@/components/teleconsult/TeleconsultGuestFlow";
import { preflightInviteOnServer } from "@/components/teleconsult/serverPreflight";

export default async function TeleconsultJoinPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string; inviteToken?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const cleanToken = (params.token || params.inviteToken || "").trim();
  const initialPreflight = await preflightInviteOnServer(cleanToken);

  return (
    <TeleconsultGuestFlow
      inviteToken={cleanToken}
      initialPreflight={initialPreflight}
      clinicName={
        initialPreflight.outcome === "valid" && initialPreflight.clinicName
          ? initialPreflight.clinicName
          : "ClinicEZ Healthcare"
      }
      clinicSupportPhone={
        initialPreflight.outcome === "valid" && initialPreflight.clinicSupportPhone
          ? initialPreflight.clinicSupportPhone
          : "(02) 8123-4567"
      }
    />
  );
}
