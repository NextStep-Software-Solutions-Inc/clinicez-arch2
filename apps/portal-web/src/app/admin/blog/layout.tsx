import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog CRM",
  description: "Manage, write, preview, and publish Clinic EZ news, updates, guides, and PhilHealth accreditation articles.",
  keywords: ["Clinic EZ", "Blog CRM", "EMR Blog", "PhilHealth EMR", "Philippine Healthcare"]
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
