import { Metadata } from "next";
import Link from "next/link";
import { 
  Building2, 
  ShieldCheck, 
  Sparkles, 
  MapPin, 
  Heart, 
  CheckCircle2, 
  ArrowRight,
  Server,
  Network,
  Stethoscope
} from "lucide-react";
import { absoluteUrl } from "@/config/site";
import { getPortalAppUrl } from "@/utils/urls";

export const metadata: Metadata = {
  title: "About Us | Clinic EZ & Nextstep Software Corporation",
  description:
    "Learn about Clinic EZ, the modern healthcare management platform developed and operated by Nextstep Software Corporation in the Philippines.",
  keywords: [
    "About Clinic EZ",
    "Nextstep Software Corporation",
    "Philippine healthcare IT",
    "clinic management software",
    "PhilHealth YAKAP provider",
  ],
  openGraph: {
    title: "About Us | Clinic EZ & Nextstep Software Corporation",
    description:
      "Learn about Clinic EZ, the modern healthcare management platform developed and operated by Nextstep Software Corporation in the Philippines.",
    url: absoluteUrl("/about"),
    siteName: "Clinic EZ",
  },
};

const pillars = [
  {
    icon: Stethoscope,
    title: "Built for Clinicians & Patients",
    description:
      "Designed from clinical observation to eliminate repetitive paperwork, long waiting lines, and transcription errors, allowing doctors to focus on care.",
  },
  {
    icon: ShieldCheck,
    title: "Statutory Compliance Built-in",
    description:
      "Native compliance with Republic Act No. 10173 (Data Privacy Act of 2012), Department of Health (DOH) regulations, and PhilHealth YAKAP eKonsulta claims.",
  },
  {
    icon: Network,
    title: "Unified Interoperability",
    description:
      "Seamless communication between clinics, diagnostic laboratories, and pharmacies using cryptographically signed ECDSA P-256 envelopes.",
  },
  {
    icon: Server,
    title: "Offline-Resilient Edge Technology",
    description:
      "Healthcare cannot afford downtime. Our edge cell architecture allows facilities to continue consultations and triage even when internet connectivity is interrupted.",
  },
];

export default function AboutPage() {
  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[5%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[130px] pointer-events-none -z-10" />
      <div className="absolute top-[45%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-4xl mx-auto relative z-10">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary mb-6 backdrop-blur-md">
          <Building2 className="h-3.5 w-3.5 mr-2" />
          Nextstep Software Corporation
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 text-foreground">
          Empowering Philippine healthcare through <span className="text-primary">unified technology</span>.
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Clinic EZ is the flagship healthcare technology platform engineered and operated by Nextstep Software Corporation. We are dedicated to modernizing healthcare facilities across the nation.
        </p>
      </section>

      {/* Story & Company Info */}
      <section className="py-12 px-6 lg:px-8 max-w-5xl mx-auto w-full relative z-10">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12 shadow-sm space-y-8">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Our Story &amp; Mission
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              Healthcare administration in the Philippines has long suffered from fragmented systems: paper-based patient charts, disconnected diagnostic reports, manual PhilHealth claim processing, and isolated pharmacy queues. 
            </p>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              <strong>Nextstep Software Corporation</strong> developed <strong>Clinic EZ</strong> to bridge these divides. By uniting outpatient clinics, diagnostic laboratories, and pharmacies into one coordinated digital ecosystem, we eliminate friction for clinicians and give patients lifelong ownership of their health records.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-muted/40">
              <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-foreground block">Headquarters</span>
                <span className="text-muted-foreground leading-relaxed block">
                  San Juan 2, Sto. Niño, Lapasan<br />
                  Cagayan de Oro City, Misamis Oriental<br />
                  Philippines 9000
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-muted/40">
              <Heart className="h-5 w-5 text-destructive shrink-0 mt-0.5 fill-current" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-foreground block">Corporate Identity</span>
                <span className="text-muted-foreground leading-relaxed block">
                  Clinic EZ is a registered software product of Nextstep Software Corporation.<br />
                  Accredited PhilHealth &amp; DPA 2012 Compliant Solution.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars Section */}
      <section className="py-16 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight mb-4">
            Our Core Architectural Pillars
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Every feature in Clinic EZ is designed around safety, legal compliance, and clinician speed.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="group flex flex-col rounded-3xl border border-border/60 bg-card p-8 transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 transition-transform group-hover:scale-105">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{pillar.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Call to action */}
      <section className="py-20 px-6 lg:px-8 max-w-5xl mx-auto w-full relative z-10">
        <div className="rounded-[3rem] bg-gradient-to-br from-primary to-emerald-600 p-10 sm:p-16 text-center text-primary-foreground shadow-2xl shadow-primary/20">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-6">
            Join the Next Step in Healthcare
          </h2>
          <p className="text-base sm:text-lg text-primary-foreground/90 max-w-2xl mx-auto mb-10 leading-relaxed">
            Experience how Clinic EZ by Nextstep Software Corporation transforms daily clinical operations. Start a free workspace trial today.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={getPortalAppUrl("/sign-up")}
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-background px-8 py-4 text-sm font-bold text-primary shadow-lg hover:bg-background/90 transition-all active:scale-95"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            <Link
              href="/contact-us"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-primary-foreground/20 bg-black/10 backdrop-blur-md px-8 py-4 text-sm font-bold text-primary-foreground hover:bg-black/20 transition-all active:scale-95"
            >
              Contact Our Advisors
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
