import { Metadata } from "next";
import Link from "next/link";
import { 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  Building2, 
  FileText, 
  Server, 
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import { absoluteUrl } from "@/config/site";

export const metadata: Metadata = {
  title: "HIPAA & Regulatory Compliance | Clinic EZ",
  description:
    "Clinic EZ health information security, Protected Health Information (PHI) safeguards, RA 10173 DPA 2012 compliance, and HIPAA alignment by Nextstep Software Corporation.",
  keywords: [
    "Clinic EZ HIPAA compliance",
    "healthcare data privacy Philippines",
    "RA 10173 compliance",
    "PHI data protection",
    "medical software security",
  ],
  openGraph: {
    title: "HIPAA & Regulatory Compliance | Clinic EZ",
    description:
      "Clinic EZ health information security, Protected Health Information (PHI) safeguards, RA 10173 DPA 2012 compliance, and HIPAA alignment.",
    url: absoluteUrl("/hipaa"),
    siteName: "Clinic EZ",
  },
};

const safeguards = [
  {
    icon: Lock,
    title: "Technical Safeguards (PHI Protection)",
    description:
      "All sensitive patient health information (vital signs, diagnoses, lab results, prescriptions) is encrypted at rest using AES-256 and transmitted exclusively over TLS 1.3.",
    items: [
      "AES-256 database-level encryption at rest",
      "TLS 1.3 enforced for all web and mobile traffic",
      "Cryptographic ECDSA P-256 interop envelope signatures",
      "Automatic session timeouts & idle screen locks",
    ],
  },
  {
    icon: KeyRound,
    title: "Administrative Safeguards (RBAC & Audit)",
    description:
      "Multi-layered governance prevents unauthorized data exposure. Strict role-based access controls ensure staff only view records within their scope of clinical duty.",
    items: [
      "Role-Based Access Control (Doctor, Nurse, MedTech, Pharmacist, Admin)",
      "Multi-Factor Authentication (MFA) enforcement",
      "Immutable clinical audit logging for every chart view and update",
      "Regular automated credential rotation and secret protection",
    ],
  },
  {
    icon: Server,
    title: "Physical & Infrastructure Safeguards",
    description:
      "Clinic EZ cloud systems run in SOC 2 Type II and ISO 27001 certified data center environments with comprehensive disaster recovery and continuous uptime monitoring.",
    items: [
      "Automated encrypted daily geo-redundant backups",
      "High-availability multi-zone failover redundancy",
      "Dedicated tenant database isolation boundaries",
      "DDoS mitigation and active Web Application Firewall (WAF)",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Philippine Statutory Compliance (RA 10173)",
    description:
      "Aligned with National Privacy Commission (NPC) circulars, DOH regulations, and PhilHealth YAKAP security requirements for healthcare providers in the Republic of the Philippines.",
    items: [
      "Personal Information Controller (PIC) / Processor (PIP) role alignment",
      "Explicit, patient-controlled encounter consent mechanisms",
      "Right to data erasure and patient record portability",
      "Designated Data Protection Officer (DPO) escalation channel",
    ],
  },
];

export default function HipaaCompliancePage() {
  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[5%] left-[-10%] w-[45%] h-[45%] rounded-full bg-primary/10 blur-[130px] pointer-events-none -z-10" />
      <div className="absolute top-[45%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-4xl mx-auto relative z-10">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary mb-6 backdrop-blur-md">
          <ShieldCheck className="h-3.5 w-3.5 mr-2" />
          Enterprise Health Data Governance
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 text-foreground">
          Security, HIPAA &amp; <br className="hidden sm:inline" />
          <span className="text-primary">DPA 2012 Compliance</span>.
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Clinic EZ is engineered and operated by Nextstep Software Corporation with defense-in-depth principles to protect Protected Health Information (PHI) across clinics, laboratories, and pharmacies.
        </p>
      </section>

      {/* Security Architecture Summary Card */}
      <section className="py-8 px-6 lg:px-8 max-w-5xl mx-auto w-full relative z-10">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-foreground">
                Health Data Protection Framework
              </h2>
              <p className="text-xs text-muted-foreground">
                Harmonizing Philippine statutory privacy mandates with international healthcare benchmarks.
              </p>
            </div>
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                RA 10173 DPA
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                HIPAA Aligned
              </span>
            </div>
          </div>

          <div className="text-sm leading-relaxed text-muted-foreground space-y-4">
            <p>
              In healthcare, confidentiality and integrity are life-critical. <strong>Nextstep Software Corporation</strong> implements rigorous safeguards so that healthcare facilities can confidently manage outpatient queues, digital medical charts, diagnostic orders, and electronic prescriptions without compromising patient privacy.
            </p>
            <p>
              Under Republic Act No. 10173 (the Data Privacy Act of 2012), accredited healthcare facilities operating on Clinic EZ act as the <strong>Personal Information Controller (PIC)</strong> for clinical consultations, while Nextstep Software Corporation acts as the <strong>Personal Information Processor (PIP)</strong> for workspace infrastructure.
            </p>
          </div>
        </div>
      </section>

      {/* Safeguards Grid */}
      <section className="py-12 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          {safeguards.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="group flex flex-col rounded-3xl border border-border/60 bg-card p-8 sm:p-10 transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold">{item.title}</h3>
                </div>

                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-8">
                  {item.description}
                </p>

                <div className="mt-auto pt-6 border-t border-border">
                  <ul className="space-y-2.5">
                    {item.items.map((sub, sIdx) => (
                      <li key={sIdx} className="flex items-start text-xs sm:text-sm">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mr-2.5 shrink-0 mt-0.5" />
                        <span className="font-medium text-foreground/90">{sub}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cross-Link Footer Banner */}
      <section className="py-16 px-6 lg:px-8 max-w-4xl mx-auto w-full mb-12 relative z-10">
        <div className="rounded-3xl border border-border bg-muted/40 p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h4 className="text-lg font-bold text-foreground">
              Review Our Full Privacy &amp; Legal Notices
            </h4>
            <p className="text-xs text-muted-foreground">
              Read how Nextstep Software Corporation protects clinical data and governs the Clinic EZ platform.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/privacy"
              className="px-5 py-2.5 rounded-full border border-border bg-background text-xs font-bold text-foreground hover:bg-muted transition-colors"
            >
              Privacy Policy (RA 10173)
            </Link>
            <Link
              href="/terms"
              className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
