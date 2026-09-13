import { Metadata } from "next";
import { TenantRegistrationClient } from "./_components/TenantRegistrationClient";

export const metadata: Metadata = {
  title: "Register Tenant | Clinic EZ",
  description: "Register a new tenant workspace in Clinic EZ.",
  keywords: ["register clinic", "create Clinic EZ account", "healthcare workspace setup"],
  openGraph: {
    title: "Register Tenant | Clinic EZ",
    description: "Register a new tenant workspace in Clinic EZ.",
    url: "https://clinicez.net/tenants/register",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.net/og-register.png",
        width: 1200,
        height: 630,
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Register Tenant | Clinic EZ",
    description: "Register a new tenant workspace in Clinic EZ.",
    images: ["https://clinicez.net/og-register.png"],
  },
};

export default function TenantRegistrationPage() {
  return <TenantRegistrationClient />;
}
