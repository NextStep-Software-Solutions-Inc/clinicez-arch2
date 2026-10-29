import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/ui/sonner";
import { VercelAnalytics } from "@/components/analytics/VercelAnalytics";
import { getMarketingBaseUrl } from "@/utils/urls";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getMarketingBaseUrl("/")),
  title: {
    default: "Clinic EZ | The Modern Healthcare Portal",
    template: "%s",
  },
  description:
    "Next-generation clinic management and healthcare administration by Clinic EZ.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen flex flex-col overscroll-none antialiased`}
      >
        <Navigation />
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
        <Toaster />
        <VercelAnalytics />
      </body>
    </html>
  );
}
