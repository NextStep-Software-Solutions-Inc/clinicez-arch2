import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Smartphone, HeartPulse, Stethoscope } from "lucide-react";
import { FeaturesCarousel } from "./_components/FeaturesCarousel";
import { MobileAppStoreButtons } from "./_components/MobileAppStoreButtons";
import { LandingIntegrations } from "./_components/LandingIntegrations";
import { LandingWorkflow } from "./_components/LandingWorkflow";
import { LandingTestimonials } from "./_components/LandingTestimonials";
import { LandingFAQ } from "./_components/LandingFAQ";
import { LandingCTA } from "./_components/LandingCTA";
import { absoluteUrl } from "@/config/site";

export const metadata: Metadata = {
  title: "Clinic EZ | The Modern Healthcare Portal",
  description: "Next-generation clinic management and healthcare administration.",
  keywords: ["healthcare", "clinic management", "EMR", "telehealth", "hospital administration"],
  openGraph: {
    title: "Clinic EZ | The Modern Healthcare Portal",
    description: "Next-generation clinic management and healthcare administration.",
    url: absoluteUrl("/"),
    siteName: "Clinic EZ",
    images: [
      {
        url: absoluteUrl("/og-image.png"),
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
    images: [absoluteUrl("/og-image.png")],
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
            href="/sign-up"
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

      <LandingIntegrations />
      <FeaturesCarousel />
      <LandingWorkflow />

      {/* Mobile Apps Section */}
      <section className="py-24 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            Powerful Mobile Apps
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Experience Clinic EZ natively on your iOS and Android devices. Beautifully designed for both patients and healthcare providers.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-stretch">
          
          {/* Patient App Card */}
          <div className="flex-1 relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-8 md:p-12 transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">
            <div className="absolute top-[-10%] right-[-10%] p-8 opacity-10 pointer-events-none">
              <HeartPulse className="w-64 h-64 text-primary" />
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mb-8 text-primary-foreground shadow-lg shadow-primary/25">
                <Smartphone className="h-8 w-8" />
              </div>
              <h3 className="text-3xl font-bold mb-4">Clinic EZ for Patients</h3>
              <p className="text-muted-foreground text-lg mb-8 max-w-md leading-relaxed flex-grow">
                Book appointments, securely view lab results, chat with your doctors, and manage your family's health records—all from the palm of your hand.
              </p>
              <MobileAppStoreButtons />
            </div>
          </div>

          {/* Provider App Card */}
          <div className="flex-1 relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-8 md:p-12 transition-all hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1">
            <div className="absolute top-[-10%] right-[-10%] p-8 opacity-10 pointer-events-none">
              <Stethoscope className="w-64 h-64 text-emerald-500" />
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="h-16 w-16 rounded-2xl bg-emerald-500 flex items-center justify-center mb-8 text-white shadow-lg shadow-emerald-500/25">
                <Smartphone className="h-8 w-8" />
              </div>
              <h3 className="text-3xl font-bold mb-4">Clinic EZ for Providers</h3>
              <p className="text-muted-foreground text-lg mb-8 max-w-md leading-relaxed flex-grow">
                Manage your schedule on the go, conduct high-quality telehealth calls, prescribe medications, and access patient histories securely anytime, anywhere.
              </p>
              <MobileAppStoreButtons />
            </div>
          </div>

        </div>
      </section>

      <LandingTestimonials />
      <LandingFAQ />
      <LandingCTA />
    </main>
  );
}
