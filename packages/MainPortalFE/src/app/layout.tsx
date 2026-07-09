import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from '@clerk/nextjs'
import { ApiProvider } from "@/components/providers/ApiProvider";
import "./globals.css";

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} overscroll-none antialiased`}
        >
          <ApiProvider>
            {children}
          </ApiProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
