import { Metadata } from "next";
import { ContactUsClient } from "./_components/ContactUsClient";

export const metadata: Metadata = {
  title: "Contact Us | Clinic EZ",
  description: "Get in touch with the Clinic EZ team.",
  keywords: ["contact Clinic EZ", "customer support", "healthcare software support", "sales inquiry"],
  openGraph: {
    title: "Contact Us | Clinic EZ",
    description: "Get in touch with the Clinic EZ team.",
    url: "https://clinicez.net/contact-us",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.net/og-contact.png",
        width: 1200,
        height: 630,
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Us | Clinic EZ",
    description: "Get in touch with the Clinic EZ team.",
    images: ["https://clinicez.net/og-contact.png"],
  },
};

export default function ContactUsPage() {
  return <ContactUsClient />;
}