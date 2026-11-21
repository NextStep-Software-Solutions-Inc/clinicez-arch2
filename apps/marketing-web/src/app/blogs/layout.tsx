import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clinic EZ Medical & Health Tech Blog",
  description: "Read clinical practice guides, PhilHealth Konsulta accreditation roadmaps, PACS workflows, and health tech product announcements on the Clinic EZ Blog.",
  keywords: ["Clinic EZ Blog", "PhilHealth Yakap EMR", "Konsulta EMR Philippine", "PACS Digital Diagnostics", "Primary Care Medical Blog"],
  openGraph: {
    title: "Clinic EZ Medical & Health Tech Blog",
    description: "Read clinical practice guides, PhilHealth Konsulta accreditation roadmaps, PACS workflows, and health tech product announcements on the Clinic EZ Blog.",
    type: "website"
  }
};

export default function BlogsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
