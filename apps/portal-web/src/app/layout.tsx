import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from "@clerk/nextjs";
import { ApiProvider } from "@/components/providers/ApiProvider";
import { Toaster } from "@/components/ui/sonner";
import { VercelAnalytics } from "@/components/analytics/VercelAnalytics";
import { CLERK_PORTAL_APPEARANCE } from "@/lib/clerkAppearance";
import "./globals.css";

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider afterSignOutUrl="/" appearance={CLERK_PORTAL_APPEARANCE}>
      <html lang="en">
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} overscroll-none antialiased`}
        >
          <ApiProvider>
            {children}
            <Toaster />
          </ApiProvider>
          <VercelAnalytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
