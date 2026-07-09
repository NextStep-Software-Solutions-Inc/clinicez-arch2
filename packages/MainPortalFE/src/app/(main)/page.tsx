import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Activity, ShieldCheck, Zap, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Clinic EZ | The Modern Healthcare Portal",
  description: "Next-generation clinic management and healthcare administration.",
  keywords: ["healthcare", "clinic management", "EMR", "telehealth", "hospital administration"],
  openGraph: {
    title: "Clinic EZ | The Modern Healthcare Portal",
    description: "Next-generation clinic management and healthcare administration.",
    url: "https://clinicez.com",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.com/og-image.png",
        width: 1200,
        height: 630,
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clinic EZ | The Modern Healthcare Portal",
    description: "Next-generation clinic management and healthcare administration.",
    images: ["https://clinicez.com/og-image.png"],
  },
};

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen bg-background overflow-hidden relative">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/40 blur-[120px] pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center pt-32 pb-24 px-6 lg:px-8 text-center relative z-10">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-8 backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
          Clinic EZ V2 is now Live
        </div>
        
        <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight sm:text-7xl mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-emerald-400">
          Healthcare Management, <br className="hidden sm:block" /> Elevated.
        </h1>
        
        <p className="max-w-2xl text-lg text-muted-foreground mb-10 leading-relaxed">
          The all-in-one unified portal for clinics, laboratories, and pharmacies. Experience seamless administration with enterprise-grade security and blazing-fast performance.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link 
            href="/tenants/register"
            className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95"
          >
            Start your free trial
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link 
            href="/solution"
            className="inline-flex items-center justify-center rounded-full border border-border bg-background/50 backdrop-blur-md px-8 py-4 text-sm font-semibold text-foreground hover:bg-muted/50 transition-all active:scale-95"
          >
            Explore Solutions
          </Link>
        </div>
      </section>

      {/* Features Grid (Glassmorphism) */}
      <section className="py-24 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-background/40 backdrop-blur-xl p-8 transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
              <Activity className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Real-time Analytics</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Monitor patient flow, resource allocation, and financials with millisecond precision in your dashboard.
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-background/40 backdrop-blur-xl p-8 transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Enterprise Security</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              HIPAA compliant architecture powered by Clerk authentication and robust tenant isolation.
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-background/40 backdrop-blur-xl p-8 transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Turbopack Speed</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Built on Next.js 16. Experience instant page loads and seamless optimistic UI updates.
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-background/40 backdrop-blur-xl p-8 transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Multi-tenant Ready</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Manage multiple clinics, laboratories, and pharmacies under a single, unified organizational roof.
            </p>
          </div>

        </div>
      </section>
    </main>
  );
}
