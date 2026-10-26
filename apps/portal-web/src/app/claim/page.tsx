import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, Building2, ArrowRight } from "lucide-react";
import { ProgressiveClaimCard } from "@/components/join/ProgressiveClaimCard";

interface ClaimPageProps {
  searchParams: Promise<{ token?: string }>;
}

export const metadata: Metadata = {
  title: "Claim Patient Account | Clinic EZ",
  description: "Claim and link your Clinic EZ patient account.",
};

function tryParseClaimTokenPayload(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(base64, "base64").toString("utf-8");
    const json = JSON.parse(jsonStr);
    return json;
  } catch {
    return null;
  }
}

export default async function ClaimPage({ searchParams }: ClaimPageProps) {
  const { token } = (await searchParams) || {};
  const cleanToken = token ? token.trim() : "";

  if (cleanToken) {
    const payload = tryParseClaimTokenPayload(cleanToken);
    const patientName = payload
      ? `${payload.FirstName || ""} ${payload.LastName || ""}`.trim()
      : undefined;
    const facilityName = payload?.FacilitySlug
      ? payload.FacilitySlug.toUpperCase()
      : undefined;
    const expiresAt = payload?.ExpiresAtUnix
      ? new Date(payload.ExpiresAtUnix * 1000).toISOString()
      : undefined;

    const pass = payload
      ? {
          trackingId: payload.JoinRequestId || "ephemeral-track",
          registrationPassId: payload.JoinRequestId || "ephemeral-pass",
          queueToken: "CLAIM-PASS",
          patientCode: "PATIENT",
          fullName: patientName || "Patient",
          facilityName: facilityName || "Clinic EZ Facility",
          facilitySlug: payload.FacilitySlug || "",
          tenantSlug: payload.TenantSlug || "",
          estimatedWaitMinutes: 0,
          issuedAt: payload.IssuedAtUnix
            ? new Date(payload.IssuedAtUnix * 1000).toISOString()
            : new Date().toISOString(),
          qrDataString: JSON.stringify({ token: cleanToken }),
          claimToken: cleanToken,
          expiresAt,
          firstName: payload.FirstName,
          lastName: payload.LastName,
          dateOfBirth: payload.DateOfBirth,
          memberType: payload.MemberType,
          email: payload.Email,
        }
      : undefined;

    return (
      <main className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        <div className="max-w-md w-full mx-auto my-auto space-y-6 pt-6 sm:pt-10">
          <ProgressiveClaimCard
            claimToken={cleanToken}
            patientName={patientName}
            facilityName={facilityName}
            expiresAt={expiresAt}
            pass={pass}
          />
        </div>
        <footer className="text-center py-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Nextstep Software Corporation. Clinic EZ is a product of Nextstep Software Corporation. Secured by Interop Hub.</p>
        </footer>
      </main>
    );
  }

  // Missing or Invalid Token State (Accessible, semantic HTTP 200 view)
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      <div className="max-w-md w-full mx-auto my-auto space-y-6 pt-6 sm:pt-10 text-center">
        <div
          role="alert"
          aria-live="polite"
          className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">
              Claim Token Required
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              No account claim token was found in the link. Claim links are sent to your email or generated after completing patient intake.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/join"
              className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:opacity-95 transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>Go to Clinic Join</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      <footer className="text-center py-4 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Nextstep Software Corporation. Clinic EZ is a product of Nextstep Software Corporation. Secured by Interop Hub.</p>
      </footer>
    </main>
  );
}
