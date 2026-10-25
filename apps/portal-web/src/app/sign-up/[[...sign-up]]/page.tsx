import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { ClinicEzLogo } from "@/components/ClinicEzLogo";
import { CustomSignUpForm } from "../_components/CustomSignUpForm";
import { SignUpTrialBadge } from "../_components/SignUpTrialBadge";
import { getPortalApiUrl } from "@/utils/domain";
import { type BillingPublicConfig } from "@/services/billing.service";

export const dynamic = "force-dynamic";

async function fetchServerPublicConfig(): Promise<BillingPublicConfig | null> {
  try {
    const apiBase = getPortalApiUrl();
    const res = await fetch(`${apiBase}/billing/public-config`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function SignUpPage() {
  const publicConfig = await fetchServerPublicConfig();

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/40 blur-[120px] pointer-events-none -z-10" />

      {/* Top Header Logo */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between z-10">
        <Link href="/" className="inline-flex items-center gap-2.5 group shrink-0">
          <ClinicEzLogo markClassName="h-8 w-8" textClassName="text-xl font-bold tracking-tight text-foreground" />
        </Link>
        <Link 
          href="/sign-in" 
          className="inline-flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-xs sm:text-sm px-3.5 py-1.5 transition-all shrink-0"
        >
          Sign In
        </Link>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 flex w-full max-w-7xl mx-auto items-center justify-center px-3 sm:px-6 py-4 sm:py-8 lg:py-12 z-10">
        <div className="flex w-full items-center justify-center gap-12 lg:gap-16">
          {/* Left Side: Brand Context (Desktop Only) */}
          <div className="hidden lg:flex flex-col w-1/2 pr-6">
            <SignUpTrialBadge initialConfig={publicConfig} />

            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight mb-6 leading-tight">
              Start Your Journey with <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-emerald-400">
                Clinic EZ.
              </span>
            </h1>

            <p className="text-base xl:text-lg text-muted-foreground mb-10 leading-relaxed max-w-xl">
              Create your account to establish your clinical workplace, provision healthcare facilities, 
              and experience the future of medical administration.
            </p>

            <div className="flex flex-col space-y-4 max-w-md">
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
                <span className="text-sm font-medium text-foreground">Immediate workspace & entity provisioning</span>
              </div>
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
                <span className="text-sm font-medium text-foreground">Clinics, laboratories, and pharmacy administration</span>
              </div>
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
                <span className="text-sm font-medium text-foreground">No credit card required to start</span>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-border/40 flex items-center gap-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span>Enterprise-grade encryption and HIPAA security safeguards.</span>
            </div>
          </div>

          {/* Right Side: Custom Form Card */}
          <div className="w-full lg:w-1/2 flex justify-center">
            <div className="w-full max-w-md rounded-2xl sm:rounded-3xl border border-border bg-card/70 backdrop-blur-2xl p-5 sm:p-8 lg:p-10 shadow-2xl shadow-primary/5">
              {/* Mobile Viewport Parity Badge (< lg) */}
              <div className="lg:hidden mb-4">
                <SignUpTrialBadge initialConfig={publicConfig} />
              </div>

              <Suspense fallback={
                <div className="h-72 flex items-center justify-center">
                  <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              }>
                <CustomSignUpForm initialTrialDays={publicConfig?.trialDays} />
              </Suspense>
            </div>
          </div>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="w-full py-4 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Nextstep Software Corporation. Clinic EZ is a product of Nextstep Software Corporation. All rights reserved.
      </footer>
    </div>
  );
}
