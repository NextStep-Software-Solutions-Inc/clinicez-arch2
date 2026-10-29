import { Metadata } from "next";
import Link from "next/link";
import { Scale, ShieldCheck, Building2, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service | Clinic EZ",
  description:
    "Terms of Service and Platform Governance Agreement for Clinic EZ Healthcare Workspaces, Clinics, Laboratories, Pharmacies, and Patients.",
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background text-foreground pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <header className="space-y-4 border-b border-border pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Scale className="w-4 h-4" />
            Platform Governance &amp; Clinical Service Terms
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective Date: October 2026 • Governing Clinic EZ Portal, Clinical Workstations, and Patient Self-Service Applications
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">Licensed Facilities</h2>
            <p className="text-xs text-muted-foreground">
              Workspaces must maintain valid DOH Licenses to Operate (LTO) and PRC-licensed clinical staff for regulated healthcare services.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">Clinical Responsibility</h2>
            <p className="text-xs text-muted-foreground">
              Medical judgment, diagnoses, prescriptions, and PhilHealth claims remain the sole professional responsibility of the attending provider.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">BIR &amp; Statutory Billing</h2>
            <p className="text-xs text-muted-foreground">
              Subscription plans, seat entitlements, and official receipts are governed by Philippine tax and electronic commerce regulations.
            </p>
          </div>
        </section>

        <article className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By registering a healthcare workspace, operating a Clinic EZ facility console, or submitting patient intake and appointment requests through Clinic EZ (a product of Nextstep Software Corporation), you agree to be bound by these Terms of Service and our{" "}
              <Link href="/privacy" className="text-primary underline hover:opacity-90">
                Privacy Policy (RA 10173)
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">2. Healthcare Workspace &amp; Provider Obligations</h2>
            <p>
              Tenant owners and administrators warrant that all clinics, diagnostic laboratories, pharmacies, and healthcare organizations provisioned on Clinic EZ hold the requisite regulatory permits in the Republic of the Philippines (including DOH LTO, PhilHealth PMCC/Accreditation where applicable, and valid PRC licenses for practicing physicians and allied health professionals).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">3. Patient Self-Intake &amp; Medical Disclaimer</h2>
            <p>
              Clinic EZ facilitates digital patient intake, appointment scheduling, document verification, and health record portability. Clinic EZ does not practice medicine or provide emergency medical dispatch. In the event of a medical emergency, patients must immediately contact local emergency services or proceed to the nearest hospital emergency department.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">4. Subscriptions, Entitlements, and Official Receipts</h2>
            <p>
              Workspace capabilities (maximum facilities, branches, staff seats, and cross-tenant interoperability) are enforced cryptographically according to the active subscription plan. Offline bank transfers, e-wallet settlements, and automated payments are verified against official billing references prior to entitlement activation and Official Receipt (OR) issuance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">5. Governing Law &amp; Venue</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines, including Republic Act No. 8792 (Electronic Commerce Act) and Republic Act No. 10173 (Data Privacy Act of 2012).
            </p>
          </section>
        </article>

        <footer className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">
              Questions regarding workspace licensing or enterprise terms?
            </p>
            <p className="text-xs text-muted-foreground">
              Our institutional onboarding team can assist with custom multi-branch deployments.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/privacy"
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/contact-us"
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-95 transition-opacity"
            >
              Contact Support
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
