import React from "react";
import { TeleconsultGuestFlow } from "@/components/teleconsult/TeleconsultGuestFlow";

export default async function TeleconsultTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <TeleconsultGuestFlow
      inviteToken={token}
      clinicName="ClinicEZ Healthcare"
      clinicSupportPhone="(02) 8123-4567"
    />
  );
}
