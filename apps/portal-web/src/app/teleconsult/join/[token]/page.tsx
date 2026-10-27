import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { TeleconsultGuestFlow } from "@/components/teleconsult/TeleconsultGuestFlow";

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
                Invalid Teleconsultation Link
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The provided link contains a token for a clinical document (e-Prescription, Medical Certificate, or Lab Order) rather than a teleconsultation invitation. Please verify your link or contact your clinic.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/teleconsult/join"
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:opacity-95 transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Enter Invitation Code</span>
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

  return (
    <TeleconsultGuestFlow
      inviteToken={cleanToken}
      clinicName="ClinicEZ Healthcare"
      clinicSupportPhone="(02) 8123-4567"
    />
  );
}
