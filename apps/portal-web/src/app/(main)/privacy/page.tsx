import { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Lock, FileText, Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy (RA 10173 DPA 2012) | ClinicEZ",
  description:
    "ClinicEZ Data Privacy Act of 2012 (Republic Act No. 10173) Notice, Patient Health Information Protection Policy, and NPC Compliance.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <header className="space-y-4 border-b border-border pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            Republic Act No. 10173 • Data Privacy Act of 2012 Compliant
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            Privacy Policy &amp; Patient Data Protection Notice
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective Date: October 2026 • Applicable across all ClinicEZ Healthcare Workspaces, Patient Portals, and Interop Hub Services
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <Lock className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">Patient-Controlled Consent</h2>
            <p className="text-xs text-muted-foreground">
              Protected Health Information (PHI) is shared across healthcare facilities strictly upon explicit patient consent or active encounter authorization.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">NPC &amp; DOH Standards</h2>
            <p className="text-xs text-muted-foreground">
              Aligned with National Privacy Commission (NPC) circulars, DOH health information standards, and PhilHealth YAKAP (Konsulta) security guidelines.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">Tenant Data Isolation</h2>
            <p className="text-xs text-muted-foreground">
              Each accredited clinic, laboratory, and pharmacy operates within an isolated tenant boundary enforced by cryptographic ECDSA P-256 interop envelopes.
            </p>
          </div>
        </section>

        <article className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">1. Scope and Role Under RA 10173</h2>
            <p>
              ClinicEZ Healthcare Technologies (&ldquo;ClinicEZ&rdquo;) provides cloud and on-premise health information software. Under Republic Act No. 10173 (the Data Privacy Act of 2012), accredited healthcare facilities (clinics, laboratories, pharmacies, and health networks) act as the <strong>Personal Information Controller (PIC)</strong> for clinical encounter records created within their workstations, while ClinicEZ acts as the <strong>Personal Information Processor (PIP)</strong> for workspace infrastructure and as the PIC for patient-managed health vault accounts in the ClinicEZ Patient App.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">2. Categories of Personal and Sensitive Personal Information Processed</h2>
            <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Patient Demographics:</strong> Full legal name, date of birth, sex, civil status, residential address, and contact details.
              </li>
              <li>
                <strong className="text-foreground">Statutory Identifiers:</strong> PhilHealth Identification Number (PIN), Principal Member PIN (for dependents), Senior Citizen ID, or PWD ID where required for statutory benefit processing.
              </li>
              <li>
                <strong className="text-foreground">Sensitive Health Information:</strong> Chief complaints, vital signs, medical and surgical history, allergies, medications, immunizations, laboratory results, e-prescriptions, and medical certificates.
              </li>
              <li>
                <strong className="text-foreground">Healthcare Provider &amp; Workspace Data:</strong> PRC license numbers, PTR/S2 identifiers, PhilHealth PMCC and Accreditation Numbers, and BIR tax registration details.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">3. Purpose of Processing &amp; Legal Basis</h2>
            <p>
              Personal and sensitive personal health information is processed exclusively for: (a) patient registration, triage, and clinical diagnosis or treatment; (b) issuance and cryptographic verification of electronic prescriptions, laboratory requests, and medical certificates; (c) statutory PhilHealth YAKAP (Konsulta) benefit eligibility and XML submission where the facility is accredited; and (d) cross-facility continuity of care initiated by the patient.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">4. Cryptographic Security, Retention, and Disposal</h2>
            <p>
              All inter-service messages transmitted through the ClinicEZ Interop Hub are signed using ECDSA P-256 keys and verified prior to ingestion. Local patient mobile records are encrypted at rest and wiped upon sign-out. Clinical records are retained in accordance with Department of Health (DOH) and National Privacy Commission retention schedules unless earlier erasure is lawfully requested and permitted by medical retention statutes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">5. Rights of the Data Subject</h2>
            <p>
              Pursuant to Section 16 of RA 10173, patients and workspace users have the right to be informed, to object, to access, to rectify inaccuracies, to revoke facility sharing grants at any time via the ClinicEZ Patient App, to data portability, and to lodge a complaint before the National Privacy Commission.
            </p>
          </section>
        </article>

        <footer className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Data Protection Officer (DPO) Inquiries
            </p>
            <p className="text-xs text-muted-foreground">
              For DPA 2012 data subject requests or compliance inquiries, contact our Data Protection Office.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/terms"
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/contact-us"
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-95 transition-opacity"
            >
              Contact DPO
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
