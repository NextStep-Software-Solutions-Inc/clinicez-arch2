import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tenants Directory",
  description: "Monitor and manage active medical clinics, pharmacies, laboratories, and subscription states within the Clinic EZ system.",
  keywords: ["Clinic EZ", "Multi-tenant EMR", "Clinics directory", "SaaS tenants"]
};

export default function TenantsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
