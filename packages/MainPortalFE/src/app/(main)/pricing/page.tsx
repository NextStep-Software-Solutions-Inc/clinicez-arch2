import { Metadata } from "next";
import { PricingClient } from "./_components/PricingClient";

export const metadata: Metadata = {
  title: "Pricing | Clinic EZ",
  description: "Simple, transparent pricing for healthcare management.",
  keywords: ["pricing", "software cost", "healthcare IT cost", "Clinic EZ pricing", "EMR subscription"],
  openGraph: {
    title: "Pricing | Clinic EZ",
    description: "Simple, transparent pricing for healthcare management.",
    url: "https://clinicez.com/pricing",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.com/og-pricing.png",
        width: 1200,
        height: 630,
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | Clinic EZ",
    description: "Simple, transparent pricing for healthcare management.",
    images: ["https://clinicez.com/og-pricing.png"],
  },
};

export default function PricingPage() {
  return <PricingClient />;
}