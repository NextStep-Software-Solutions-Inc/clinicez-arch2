import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsletter Subscribers | Clinic EZ Admin",
  description: "View, filter, and export Clinic EZ newsletter and updates subscribers.",
  keywords: ["Clinic EZ", "Newsletter", "Subscribers", "Email marketing", "Admin dashboard"]
};

export default function SubscribersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
