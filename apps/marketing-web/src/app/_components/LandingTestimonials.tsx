"use client";

import { Star } from "lucide-react";
import { useRef } from "react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

const testimonials = [
  {
    quote: "Since switching to Clinic EZ, our no-show rate dropped by 40% thanks to the AI Pre-Assessment. It completely changed our workflow.",
    author: "Dr. Maria Santos",
    role: "Chief Medical Officer",
    clinic: "Metro Manila General Hospital",
    avatar: "MS",
  },
  {
    quote: "The unified dashboard allows us to manage our 5 pharmacy branches effortlessly. Inventory and billing are finally in sync.",
    author: "Roberto Chen",
    role: "Operations Director",
    clinic: "HealthPlus Pharmacies",
    avatar: "RC",
  },
  {
    quote: "Generating PhilHealth Yakap reports used to take days. Now, it takes a single click. I cannot imagine going back to our old system.",
    author: "Elena De Guzman",
    role: "Clinic Administrator",
    clinic: "St. Luke's Family Clinic",
    avatar: "EG",
  },
  {
    quote: "The AI SOAP summarizer saves me at least two hours of documentation every single day. Highly recommended for busy doctors.",
    author: "Dr. James Lim",
    role: "General Practitioner",
    clinic: "Lim Family Practice",
    avatar: "JL",
  }
];

export function LandingTestimonials() {
  const plugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-[90rem] mx-auto w-full relative z-10 overflow-hidden">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
          Trusted by Healthcare Leaders
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          See why modern clinics and hospitals are moving to Clinic EZ to power their daily operations.
        </p>
      </div>

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
            {testimonials.map((testimonial, i) => (
              <CarouselItem key={i} className="pl-4 md:pl-6 md:basis-1/2 lg:basis-1/3">
                <div className="flex flex-col h-full justify-between rounded-3xl border border-border/50 bg-background/40 backdrop-blur-xl p-8 hover:shadow-xl transition-all">
                  <div>
                    <div className="flex gap-1 mb-6 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-current" />
                      ))}
                    </div>
                    <p className="text-lg leading-relaxed text-foreground/90 italic mb-8">
                      "{testimonial.quote}"
                    </p>
                  </div>
                  <div className="flex items-center gap-4 mt-auto">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <h4 className="font-bold">{testimonial.author}</h4>
                      <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                      <p className="text-xs text-primary font-medium mt-1">{testimonial.clinic}</p>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
}
