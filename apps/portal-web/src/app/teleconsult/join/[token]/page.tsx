import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { TeleconsultGuestFlow } from "@/components/teleconsult/TeleconsultGuestFlow";
import { preflightInviteOnServer } from "@/components/teleconsult/serverPreflight";

function isMismatchedDocumentToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (
    lower.startsWith("rx-") ||
    lower.startsWith("mc-") ||
    lower.startsWith("ref-") ||
    lower.startsWith("lab-") ||
    lower.startsWith("sec-sha256-")
  ) {
    return true;
  }
  // 32-hex clinicId + '.' + 32-hex secret (Rx verification token)
  if (token.length === 65 && token[32] === ".") {
    return true;
  }
  // 32-hex clinicId + '.' + base64url (~22 chars) (Lab upload token)
  if (token.length >= 50 && token.length <= 60 && token.indexOf(".") === 32) {
    return true;
  }
  return false;
}

export default async function TeleconsultTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cleanToken = token ? token.trim() : "";

  if (cleanToken && isMismatchedDocumentToken(cleanToken)) {
    return (
      <main className="min-h-dvh bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 lg:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md w-full mx-auto my-auto space-y-6 pt-6 sm:pt-10 text-center">
          <div
            role="alert"
            aria-live="polite"
            className="bg-card border border-border rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Wrong Link Type
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This link is for a medical document (such as a prescription or lab result), not a video visit. Please check the link from your clinic or go to the video visit check-in page.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/teleconsult/join"
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-base shadow-sm hover:opacity-95 transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Go to Video Check-In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <footer className="text-center py-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Nextstep Software Corporation. Clinic EZ is a product of Nextstep Software Corporation.</p>
        </footer>
      </main>
    );
  }

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
