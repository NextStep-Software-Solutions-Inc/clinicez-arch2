import HeroFeatured from "@/components/Hero";
import HeroBackground from "@/components/HeroBackground";
import SecondaryBackgroundImage from "../../../../public/assets/secondary-background.png"
import { Metadata } from "next";
import { ContactUsForm } from "@/components/ContactUsForm";

export const metadata: Metadata = {
  title: "Contact Us | Clinic EZ V2",
  description: "Get in touch with Clinic EZ for any inquiries, support, or feedback.",
}

export default function ContactUsPage() {
  return (
    <main>
      <section className="flex items-center justify-center min-h-screen">
        <HeroBackground path={SecondaryBackgroundImage} opacity={0.3} />
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-6xl mx-auto">
            {/* Mobile Layout */}
            <div className="lg:hidden space-y-8">
              <div className="max-w-lg mx-auto">
                <HeroFeatured page="contact" />
              </div>
              <div className="max-w-lg mx-auto">
                <ContactUsForm />
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden lg:grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <HeroFeatured page="contact" />
              </div>
              <div className="flex justify-center lg:justify-end">
                <ContactUsForm />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}