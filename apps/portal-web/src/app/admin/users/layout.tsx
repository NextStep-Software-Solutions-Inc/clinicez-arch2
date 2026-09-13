import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Users Management",
  description: "Manage operator user profiles, assign organizational roles, and audit access permissions for Clinic EZ administrators.",
  keywords: ["Clinic EZ", "Admin users", "Staff management", "Access profiles"]
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
