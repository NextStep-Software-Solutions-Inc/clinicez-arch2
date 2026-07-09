import HeroBackground from "@/components/HeroBackground"
import { Metadata } from "next"
import MainBackgroundImage from "../../../../public/assets/main-background.png"
import HeroFeatured from "@/components/Hero"
import FeaturedItems from "@/components/FeaturedItems"

export const metadata: Metadata = {
  title: "Pricing | Clinic EZ V2",
  description: "Clinic EZ offers competitive pricing plans for healthcare providers, ensuring value and quality.",
}

export default function PricingPage() {
  return (
    <main>
      <section className="flex flex-col items-center justify-center min-h-screen">
        <HeroBackground path={MainBackgroundImage} opacity={0.3} />
        <HeroFeatured page="pricing" />
      </section>
      <FeaturedItems page="pricing" />
    </main>
  )
}