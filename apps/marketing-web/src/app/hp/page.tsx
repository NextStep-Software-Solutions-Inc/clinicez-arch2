import HeroBackground from "@/components/HeroBackground";
import { Metadata } from "next";
import SecondaryBackgroundImage from "@public/assets/secondary-background.png";
import HeroFeatured from "@/components/Hero";
import Shell from "@/components/Shell";
import Suspend from "@/components/Suspend";
import { directoryService } from "@/services/directory.service";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Healthcare Providers | Clinic EZ",
  description:
    "Clinic EZ connects healthcare providers across outpatient clinics, laboratories, and pharmacies.",
};

export default async function HPPage() {
  const providers = await directoryService.getProviders();

  return (
    <div>
      <section className="flex flex-col items-center min-h-screen mt-32">
        <HeroBackground path={SecondaryBackgroundImage} opacity={0.3} />
        <HeroFeatured page="hp" />
        <div className="container mx-auto px-4 mt-16 pb-16">
          <Suspend
            loadingFallback={
              <div className="flex items-center justify-center h-64">
                <p className="text-lg text-muted-foreground">Loading healthcare providers...</p>
              </div>
            }
          >
            <Shell data={providers} type="hp" />
          </Suspend>
        </div>
      </section>
    </div>
  );
}
