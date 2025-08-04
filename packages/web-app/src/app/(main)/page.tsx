import FeaturedItems from "@/components/FeaturedItems";
import HeroBackground from "@/components/HeroBackground";
import MainBackgroundImage from "../../../public/assets/main-background.png"
import { Metadata } from "next"
import HeroFeatured from "@/components/Hero";

export const metadata: Metadata = {
  title: "Home | Clinic EZ V2",
  description: "Redesigned Healthcare Management System",
}

export default function MainPage() {
  return (
    <main>
      <section className="flex flex-col items-center justify-center min-h-screen">
        <HeroBackground path={MainBackgroundImage} opacity={0.3} />
        <HeroFeatured page="hero" />
      </section>
      <FeaturedItems page="hero" />
    </main>
  );
}
