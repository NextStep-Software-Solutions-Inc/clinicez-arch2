import HeroBackground from "@/components/HeroBackground"
import { Metadata } from "next"
import MainBackgroundImage from "../../../../public/assets/main-background.png"
import HeroFeatured from "@/components/Hero"
import FeaturedItems from "@/components/FeaturedItems"
// import HeroFeatured from "@/components/Hero"

export const metadata: Metadata = {
  title: "Healthcare Providers | Clinic EZ V2",
  description: "ClinicEZ has multiple connections to healthcare providers, allowing for seamless integration and management of healthcare operations.",
}

// Healthcare provider page
export default function HPPage() {
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