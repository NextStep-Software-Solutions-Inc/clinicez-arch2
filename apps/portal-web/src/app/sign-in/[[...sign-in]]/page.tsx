import { Suspense } from "react";
import Link from "next/link";
import { Stethoscope, Sparkles, CheckCircle2, ShieldCheck } from "lucide-react";
import { CustomSignInForm } from "../_components/CustomSignInForm";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/40 blur-[120px] pointer-events-none -z-10" />

      {/* Top Header Logo */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground shadow-sm">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">Clinic EZ</span>
        </Link>
        <Link 
          href="/sign-up" 
          className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Don&apos;t have an account? <span className="text-primary hover:underline">Get Started</span>
        </Link>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 flex w-full max-w-7xl mx-auto items-center justify-center px-6 py-8 sm:py-12 z-10">
        <div className="flex w-full items-center justify-center gap-12 lg:gap-16">
          {/* Left Side: Brand Context (Desktop Only) */}
          <div className="hidden lg:flex flex-col w-1/2 pr-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary mb-6 w-fit backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" />
              Secure Practitioner & Workspace Portal
            </div>

            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight mb-6 leading-tight">
              Healthcare Management, <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-emerald-400">
                Elevated.
              </span>
            </h1>

            <p className="text-base xl:text-lg text-muted-foreground mb-10 leading-relaxed max-w-xl">
              Log in to manage your medical workplaces, electronic health records, 
              facility operations, and administrative dashboards with enterprise-grade isolation.
            </p>

            <div className="flex flex-col space-y-4 max-w-md">
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
                <span className="text-sm font-medium text-foreground">Complete multi-tenant workspace isolation</span>
              </div>
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
                <span className="text-sm font-medium text-foreground">Seamless telemetry and facility administration</span>
              </div>
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
                <span className="text-sm font-medium text-foreground">HIPAA & HL7 FHIR compliance ready</span>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-border/40 flex items-center gap-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span>Protected by end-to-end encryption & robust session safeguards.</span>
            </div>
          </div>

          {/* Right Side: Custom Form Card */}
          <div className="w-full lg:w-1/2 flex justify-center">
            <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur-2xl p-7 sm:p-10 shadow-2xl shadow-primary/5">
              <Suspense fallback={
                <div className="h-72 flex items-center justify-center">
                  <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              }>
                <CustomSignInForm />
              </Suspense>
            </div>
          </div>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="w-full py-4 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} NextStep Software Solutions Inc. All rights reserved.
      </footer>
    </div>
  );
}
