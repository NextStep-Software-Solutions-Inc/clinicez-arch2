import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Role & Access",
  description: "Configure security roles, manage administrative access levels, and assign fine-grained permissions for dashboard operators.",
  keywords: ["Clinic EZ", "RBAC", "Dashboard security", "User access roles"]
};

export default function RolesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
