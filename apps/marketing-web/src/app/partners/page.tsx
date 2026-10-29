import { Metadata } from "next";
import Link from "next/link";
import { 
  Network, 
  FlaskConical, 
  Pill, 
  Building2, 
  Cpu, 
  CheckCircle2, 
  ArrowRight,
  Handshake,
  ShieldCheck,
  Zap
} from "lucide-react";
import { absoluteUrl } from "@/config/site";

export const metadata: Metadata = {
  title: "Partners & Ecosystem | Clinic EZ",
  description:
    "Partner with Nextstep Software Corporation and Clinic EZ. Connect diagnostic laboratories, pharmacies, HMOs, and medical hardware into a unified Philippine healthcare network.",
  keywords: [
    "Clinic EZ partners",
    "healthcare interoperability Philippines",
    "LIS laboratory integration",
    "pharmacy network integration",
    "PhilHealth YAKAP partners",
  ],
  openGraph: {
    title: "Partners & Ecosystem | Clinic EZ",
    description:
      "Partner with Nextstep Software Corporation and Clinic EZ. Connect diagnostic laboratories, pharmacies, HMOs, and medical hardware.",
    url: absoluteUrl("/partners"),
    siteName: "Clinic EZ",
  },
};

const partnerTracks = [
  {
    icon: FlaskConical,
    title: "Diagnostic & Reference Laboratories",
    description:
      "Connect your Laboratory Information System (LIS) directly to Clinic EZ. Receive electronic lab requests from ordering physicians and deliver cryptographically verified results directly to patient vaults.",
    benefits: [
      "Bi-directional LIS HL7/JSON integration",
      "Elimination of manual paper result pickup",
      "Cryptographic ECDSA verification stamps",
      "Increased outpatient lab referral volume",
    ],
  },
  {
    icon: Pill,
    title: "Community & Hospital Pharmacies",
    description:
      "Integrate your dispensary with Clinic EZ E-Prescriptions. Enable patients to route approved prescriptions directly to your branch for rapid dispensing and inventory tracking.",
    benefits: [
      "Legally compliant digital signature verification",
      "Automated drug interaction warnings",
      "Real-time stock reservation and POS reconciliation",
      "Repeat prescription refill pipelines",
    ],
  },
  {
    icon: Building2,
    title: "HMOs & Healthcare Payers",
    description:
      "Accelerate claims processing and eliminate fraudulent submissions by interfacing directly with Clinic EZ's PhilHealth YAKAP and statutory billing engine.",
    benefits: [
      "Real-time member eligibility verification",
      "Standardized electronic clinical encounter transmittals",
      "Reduced claim rejection rates through auto-validation",
      "Transparent audit trails for medical reviews",
    ],
  },
  {
    icon: Cpu,
    title: "Medical Equipment & Hardware Vendors",
    description:
      "Interface your clinical analyzers (CBC, blood chemistry, urinalysis, ECG) directly with local Clinic EZ Edge cells, streaming test results directly to encounter charts.",
    benefits: [
      "Serial RS-232 and TCP/IP ASTM/HL7 driver support",
      "Direct machine-to-chart result binding",
      "Zero manual transcription errors",
      "Certified hardware partner accreditation",
    ],
  },
];

export default function PartnersPage() {
  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-primary/10 blur-[130px] pointer-events-none -z-10" />
      <div className="absolute top-[45%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[130px] pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-4xl mx-auto relative z-10">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary mb-6 backdrop-blur-md">
          <Handshake className="h-3.5 w-3.5 mr-2" />
          Nextstep Software Corporation Ecosystem
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 text-foreground">
          Partner with the <br className="hidden sm:inline" />
          <span className="text-primary">Clinic EZ Network</span>.
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          We collaborate with diagnostic laboratories, pharmacies, healthcare payers, and medical device manufacturers to establish seamless, interoperable care across the Philippines.
        </p>
      </section>

      {/* Partner Tracks Grid */}
      <section className="py-12 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          {partnerTracks.map((track, idx) => {
            const Icon = track.icon;
            return (
              <div
                key={idx}
                className="group flex flex-col rounded-3xl border border-border/60 bg-card p-8 sm:p-10 transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h2 className="text-2xl font-bold">{track.title}</h2>
                </div>

                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed mb-8">
                  {track.description}
                </p>

                <div className="mt-auto pt-6 border-t border-border">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-4">
                    Key Integration Capabilities
                  </h3>
                  <ul className="space-y-2.5">
                    {track.benefits.map((benefit, bIdx) => (
                      <li key={bIdx} className="flex items-start text-xs sm:text-sm">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mr-2.5 shrink-0 mt-0.5" />
                        <span className="font-medium text-foreground/90">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Partnership Benefits Banner */}
      <section className="py-16 px-6 lg:px-8 max-w-5xl mx-auto w-full relative z-10">
        <div className="rounded-3xl border border-border bg-gradient-to-br from-card to-primary/5 p-8 sm:p-12 shadow-sm space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Why Partner with Nextstep Software Corporation?
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Every integration is backed by dedicated developer documentation, sandbox testing environments, and verified cryptographic compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
            <div className="p-5 rounded-2xl bg-background border border-border space-y-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h3 className="font-bold text-sm">ECDSA Cryptography</h3>
              <p className="text-xs text-muted-foreground">
                All interop messages and payloads carry tamper-proof cryptographic signatures ensuring zero medical fraud.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-background border border-border space-y-2">
              <Network className="h-6 w-6 text-primary" />
              <h3 className="font-bold text-sm">Directory Exposure</h3>
              <p className="text-xs text-muted-foreground">
                Accredited partners appear automatically in the Clinic EZ Provider Directory and Patient App map.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-background border border-border space-y-2">
              <Zap className="h-6 w-6 text-primary" />
              <h3 className="font-bold text-sm">Edge + Cloud Ready</h3>
              <p className="text-xs text-muted-foreground">
                Deploy connections to both our cloud multi-tenant hub and on-premise clinic edge gateways.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="py-16 px-6 lg:px-8 max-w-4xl mx-auto w-full text-center relative z-10">
        <div className="rounded-3xl bg-card border border-border p-8 sm:p-12 shadow-md space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to Connect Your Healthcare Facility?
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
            Our technical integrations team at Nextstep Software Corporation will help you configure secure API endpoints and verify interop certification.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link
              href="/contact-us"
              className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
            >
              Request Partner Consultation
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/solution"
              className="inline-flex items-center justify-center rounded-full border border-border bg-background px-8 py-3.5 text-sm font-semibold text-foreground hover:bg-muted transition-all"
            >
              Explore Platform Solutions
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
