import { Metadata } from "next";
import Link from "next/link";
import { 
  Briefcase, 
  Users, 
  Code2, 
  HeartHandshake, 
  Sparkles, 
  Mail, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock
} from "lucide-react";
import { absoluteUrl, siteEmails, careersContactHref } from "@/config/site";
import { NewsletterForm } from "@/components/NewsletterForm";

export const metadata: Metadata = {
  title: "Careers & Talent Network | Clinic EZ",
  description:
    "Explore career opportunities and engineering culture at Nextstep Software Corporation, makers of Clinic EZ. Learn about our talent network and future openings.",
  keywords: [
    "Clinic EZ careers",
    "Nextstep Software Corporation jobs",
    "healthcare tech jobs Philippines",
    "software engineering healthcare",
  ],
  openGraph: {
    title: "Careers & Talent Network | Clinic EZ",
    description:
      "Explore career opportunities and engineering culture at Nextstep Software Corporation, makers of Clinic EZ.",
    url: absoluteUrl("/careers"),
    siteName: "Clinic EZ",
  },
};

const cultureHighlights = [
  {
    icon: Code2,
    title: "Engineering for Real Patients",
    description:
      "We design resilient systems—from offline-first edge sync in rural clinics to high-throughput cloud interoperability across clinics, diagnostic labs, and pharmacies.",
  },
  {
    icon: Users,
    title: "High Autonomy, Direct Impact",
    description:
      "We operate as a focused, high-cadence engineering team without bureaucratic overhead. Every contributor directly shapes the product roadmap and user experience.",
  },
  {
    icon: ShieldCheck,
    title: "Domain Depth & Compliance",
    description:
      "We take healthcare data privacy seriously. Our team masters Philippine health informatics, PhilHealth YAKAP eClaims, and cryptographic interop standards.",
  },
  {
    icon: HeartHandshake,
    title: "Remote-Friendly & Pragmatic",
    description:
      "Headquartered in Cagayan de Oro City, Philippines, we embrace asynchronous workflows, clear documentation, and pragmatic engineering practices.",
  },
];

export default function CareersPage() {
  const careersEmail = siteEmails.careers || "connect@nextstep-software.com";

  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-primary/10 blur-[130px] pointer-events-none -z-10" />
      <div className="absolute top-[40%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[130px] pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-4xl mx-auto relative z-10">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary mb-6 backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 mr-2" />
          Careers at Nextstep Software Corporation
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 text-foreground">
          Build technology that powers <br className="hidden sm:inline" />
          <span className="text-primary">Philippine Healthcare</span>.
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Clinic EZ is engineered and operated by Nextstep Software Corporation. We are building the modern clinical operating system for healthcare providers across the country.
        </p>
      </section>

      {/* Status Notice Banner (Explicit "We are not hiring now but not a 404") */}
      <section className="px-6 lg:px-8 max-w-4xl mx-auto w-full mb-16 relative z-10">
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-8 sm:p-10 relative overflow-hidden shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold tracking-wide uppercase">
                <Clock className="w-3.5 h-3.5" />
                Current Status: No Active Openings
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                We are not actively hiring right now
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                Our team is currently at full capacity for our current development milestone. However, we love connecting with exceptional engineers, clinical informatics specialists, and product designers for upcoming projects and future opportunities.
              </p>
            </div>

            <a
              href={careersContactHref()}
              className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 transition-all shrink-0 active:scale-95"
            >
              <Mail className="h-4 w-4 mr-2" />
              Connect With Us
            </a>
          </div>

          <div className="mt-6 pt-6 border-t border-amber-500/15 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Note:</span>
            <span>
              We don&apos;t have a dedicated HR department yet—inquiries and portfolio submissions are reviewed directly by our founding engineering and product leadership.
            </span>
          </div>
        </div>
      </section>

      {/* Culture & Working at Nextstep */}
      <section className="py-12 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight mb-4">
            How We Work at Nextstep Software
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Our mission is bold: modernize healthcare operations and empower practitioners across the Philippines with dependable, elegant software.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {cultureHighlights.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="group flex flex-col rounded-3xl border border-border/60 bg-card p-8 transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 transition-transform group-hover:scale-105">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Talent Network & CV Submission Section */}
      <section className="py-16 px-6 lg:px-8 max-w-5xl mx-auto w-full relative z-10">
        <div className="rounded-[2.5rem] border border-border bg-gradient-to-br from-card via-card to-primary/5 p-8 sm:p-12 shadow-xl">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center shadow-inner">
              <Briefcase className="h-7 w-7" />
            </div>

            <h2 className="text-3xl font-black tracking-tight text-foreground">
              Join Our Talent Network
            </h2>

            <p className="text-muted-foreground text-sm leading-relaxed">
              If you are passionate about medical technology, distributed systems (.NET / TypeScript / React), or health informatics, we would love to know about you. Send your resume or GitHub profile to our direct connection inbox:
            </p>

            <div className="p-4 rounded-2xl bg-background border border-border inline-flex items-center gap-3 text-sm font-mono font-semibold text-primary">
              <Mail className="h-4 w-4" />
              <span>{careersEmail}</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <a
                href={careersContactHref()}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/25 transition-all"
              >
                Send CV to Leadership
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
              <Link
                href="/about"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-border bg-background px-8 py-3.5 text-sm font-semibold text-foreground hover:bg-muted transition-all"
              >
                Learn About Our Mission
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Talent Updates / Newsletter */}
      <section className="pb-24 px-6 lg:px-8 max-w-3xl mx-auto w-full text-center relative z-10">
        <h3 className="text-xl font-bold mb-2">Want to know when roles open?</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Subscribe to our engineering and product updates. We announce open positions to our subscribers first.
        </p>
        <div className="flex justify-center">
          <NewsletterForm />
        </div>
      </section>
    </main>
  );
}
