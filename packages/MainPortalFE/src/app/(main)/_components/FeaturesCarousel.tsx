"use client";

import { Activity, ShieldCheck, Zap, Users, FileText, BrainCircuit, Stethoscope, ClipboardCheck, FileEdit } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { useRef } from "react";

export function FeaturesCarousel() {
  const plugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  const features = [
    {
      title: "AI Patient Insight",
      description: "Leverage machine learning to predict patient no-shows, optimize scheduling, and personalize care plans automatically.",
      icon: BrainCircuit,
    },
    {
      title: "AI Symptoms Analyzer",
      description: "Provide an intelligent preliminary diagnosis based on patient-reported symptoms before they even step into the clinic.",
      icon: Stethoscope,
    },
    {
      title: "AI Pre-Assessment",
      description: "Automate patient onboarding with an intelligent system that collects medical history and pre-screens for risk factors.",
      icon: ClipboardCheck,
    },
    {
      title: "AI SOAP Summarizer",
      description: "Transform your raw consultation notes into perfectly structured SOAP notes in seconds using advanced NLP.",
      icon: FileEdit,
    },
    {
      title: "Patient Insights",
      description: "Gain instant visibility into patient flow, wait times, and clinic performance to make smarter operational decisions.",
      icon: Activity,
    },
    {
      title: "Bank-grade Security",
      description: "Keep patient data fully protected. All files and data transfers are end-to-end encrypted within our HIPAA-compliant infrastructure.",
      icon: ShieldCheck,
    },
    {
      title: "Lightning Fast",
      description: "Save hours every week with a blazing fast interface that never keeps your staff or your patients waiting.",
      icon: Zap,
    },
    {
      title: "Unified Management",
      description: "Seamlessly run multiple clinics, pharmacies, and labs from one centralized, easy-to-use platform.",
      icon: Users,
    },
    {
      title: "PhilHealth Yakap Reporting",
      description: "Generate compliant PhilHealth Yakap reports instantly, saving hours of administrative work while ensuring accuracy.",
      icon: FileText,
    },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-[90rem] mx-auto w-full relative z-10 overflow-hidden">
      <div className="w-full [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          plugins={[plugin.current]}
          className="w-full"
        >
          <CarouselContent className="-ml-4 md:-ml-6 py-4">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <CarouselItem key={index} className="pl-4 md:pl-6 md:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                  <div className="h-full group relative overflow-hidden rounded-3xl border border-border/50 bg-background/40 backdrop-blur-xl p-8 transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
}
