import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPortalAppUrl } from "@/utils/urls";

export function LandingCTA() {
  return (
    <section className="py-24 px-6 lg:px-8 max-w-5xl mx-auto w-full relative z-10">
      <div className="relative overflow-hidden rounded-[3rem] bg-gradient-to-br from-primary to-emerald-600 p-10 md:p-16 text-center text-primary-foreground shadow-2xl shadow-primary/25">
        {/* Background decorative circles */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-white/10 blur-[80px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-black/10 blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
            Ready to modernize your clinic?
          </h2>
          <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-10 leading-relaxed">
            Join hundreds of healthcare leaders who have already upgraded to Clinic EZ. Sign up today and experience the future of healthcare administration.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <a
              href={getPortalAppUrl("/sign-up")}
              className="inline-flex items-center justify-center rounded-full bg-background px-8 py-4 text-sm font-bold text-primary shadow-lg hover:bg-background/90 transition-all active:scale-95"
            >
              Start your free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            <Link
              href="/contact-us"
              className="inline-flex items-center justify-center rounded-full border border-primary-foreground/20 bg-black/10 backdrop-blur-md px-8 py-4 text-sm font-bold text-primary-foreground hover:bg-black/20 transition-all active:scale-95"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
