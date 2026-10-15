import HeroBackground from "@/components/HeroBackground"
import { Metadata } from "next"
import MainBackgroundImage from "../../../../public/assets/main-background.png"
import HeroFeatured from "@/components/Hero"
import Shell from "@/components/Shell"
import Suspend from "@/components/Suspend"
import { directoryService } from "@/services/directory.service"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Organizations | Clinic EZ V2",
  description: "Explore various organizations that you can join to enhance your healthcare experience.",
}

export default async function OrganizationPage() {
  const organizations = await directoryService.getOrganizations()

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
            <Shell data={organizations} type="organizations" />
          </Suspend>
        </div>
      </section>
    </main>
  )
}