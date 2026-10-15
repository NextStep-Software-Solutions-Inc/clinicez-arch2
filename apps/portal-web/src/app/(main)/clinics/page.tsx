import HeroBackground from "@/components/HeroBackground"
import { Metadata } from "next"
import SecondaryBackgroundImage from "../../../../public/assets/secondary-background.png"
import HeroFeatured from "@/components/Hero"
import Shell from "@/components/Shell"
import Suspend from "@/components/Suspend"
import { directoryService } from "@/services/directory.service"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Clinics | Clinic EZ V2",
  description: "Find clinics near you and join them to enhance your healthcare experience.",
}

export default async function ClinicsPage() {
  const clinics = await directoryService.getClinics()

  return (
    <main>
      <section className="flex flex-col items-center min-h-screen mt-32">
        <HeroBackground path={SecondaryBackgroundImage} opacity={0.3} />
        <HeroFeatured page="clinics" />
        <div className="container mx-auto px-4 mt-16 pb-16">
          <Suspend loadingFallback={
            <div className="flex items-center justify-center h-64">
              <p className="text-lg text-gray-500">Loading clinics...</p>
            </div>
          }>
            <Shell data={clinics} type="clinics" />
          </Suspend>
        </div>
      </section>
    </main>
  )
}