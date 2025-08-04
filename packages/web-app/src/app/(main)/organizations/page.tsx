import HeroBackground from "@/components/HeroBackground"
import { Metadata } from "next"
import MainBackgroundImage from "../../../../public/assets/main-background.png"
import HeroFeatured from "@/components/Hero"
import Shell, { mockOrganizationsData } from "@/components/Shell"
import Suspend from "@/components/Suspend"
import GlobalError from "@/components/GlobalError"

export const metadata: Metadata = {
  title: "Organizations | Clinic EZ V2",
  description: "Explore various organizations that you can join to enhance your healthcare experience.",
}

export default function OrganizationPage() {
  return (
    <main>
      <section className="flex flex-col items-center min-h-screen mt-32">
        <HeroBackground path={MainBackgroundImage} opacity={0.3} />
        <HeroFeatured page="organization" />
        <div className="container mx-auto px-4 mt-16 pb-16">
          <Suspend loadingFallback={
            <div className="flex items-center justify-center h-64">
              <p className="text-lg text-gray-500">Loading organizations...</p>
            </div>
          }>
            <Shell data={mockOrganizationsData} type="organizations" />
          </Suspend>
        </div>
      </section>
    </main>
  )
}