"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TeleconsultGuestFlow } from "@/components/teleconsult/TeleconsultGuestFlow";

function TeleconsultJoinContent() {
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

export default function TeleconsultJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
          <div className="w-full max-w-md p-8 rounded-2xl bg-card border border-border text-center space-y-3">
            <div className="animate-spin text-3xl mx-auto">⏳</div>
            <p className="text-sm font-semibold text-foreground">
              Preparing secure teleconsultation session...
            </p>
            <p className="text-xs text-muted-foreground">
              Verifying cryptographic environment and establishing zero-PHI channel.
            </p>
          </div>
        </div>
      }
    >
      <TeleconsultJoinContent />
    </Suspense>
  );
}
