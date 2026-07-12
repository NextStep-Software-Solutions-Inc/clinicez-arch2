import { Metadata } from "next";
import AdminLayoutClient from "./AdminLayoutClient";

export const metadata: Metadata = {
  title: {
    template: "%s | Clinic EZ Admin Portal",
    default: "Overview | Clinic EZ Admin Portal"
  },
  description: "Administrative command center for monitoring clinic registrations, system logs, role permissions, and blog content systems for Clinic EZ.",
  keywords: ["Clinic EZ", "Admin Portal", "Clinic Management", "Healthcare SaaS", "EMR Management"],
  openGraph: {
    title: "Clinic EZ Admin Portal",
    description: "Administrative command center for monitoring clinic registrations, system logs, role permissions, and blog content systems for Clinic EZ.",
    type: "website"
  }
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
