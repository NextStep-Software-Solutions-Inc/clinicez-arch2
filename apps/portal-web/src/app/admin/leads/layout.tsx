import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leads Management",
  description: "Track and manage clinic registrations, owner contacts, subscription plans, and conversion flows for Clinic EZ.",
  keywords: ["Clinic EZ", "Leads", "Clinic registrations", "SaaS dashboard"]
};

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
