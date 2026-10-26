"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TeleconsultGuestFlow } from "@/components/teleconsult/TeleconsultGuestFlow";

function JoinTeleconsultContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || searchParams.get("inviteToken") || "";

  return (
    <TeleconsultGuestFlow
      inviteToken={token}
      clinicName="ClinicEZ Healthcare"
      clinicSupportPhone="(02) 8123-4567"
    />
  );
}

export default function JoinTeleconsultPage() {
  return (
    <Suspense fallback={null}>
      <JoinTeleconsultContent />
    </Suspense>
  );
}
