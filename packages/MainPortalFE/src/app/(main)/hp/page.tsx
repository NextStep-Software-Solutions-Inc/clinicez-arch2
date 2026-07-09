import HeroBackground from "@/components/HeroBackground"
import { Metadata } from "next"
import SecondaryBackgroundImage from "@public/assets/secondary-background.png"
import HeroFeatured from "@/components/Hero"
import Shell, { mockHpData } from "@/components/Shell"
import Suspend from "@/components/Suspend"

export const metadata: Metadata = {
  title: "Healthcare Providers | Clinic EZ V2",
  description: "ClinicEZ has multiple connections to healthcare providers, allowing for seamless integration and management of healthcare operations.",
}

// Healthcare provider page
export default function HPPage() {
  return (
    <main>
      <section className="flex flex-col items-center min-h-screen mt-32">
        <HeroBackground path={SecondaryBackgroundImage} opacity={0.3} />
        <HeroFeatured page="hp" />
        <div className="container mx-auto px-4 mt-16 pb-16">
          <Suspend loadingFallback={
            <div className="flex items-center justify-center h-64">
              <p className="text-lg text-gray-500">Loading healthcare providers...</p>
            </div>
          }>
            <Shell data={mockHpData} type="hp" />
          </Suspend>
        </div>
      </section>
    </main>
  )
}