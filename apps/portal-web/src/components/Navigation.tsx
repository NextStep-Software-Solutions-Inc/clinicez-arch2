"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Stethoscope } from "lucide-react";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { name: "Solutions", href: "/solution" },
    { name: "Products", href: "/products" },
    { name: "Pricing", href: "/pricing" },
    { name: "Blog", href: "/blogs" },
    { name: "Contact", href: "/contact-us" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-6 lg:px-8 max-w-7xl">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground shrink-0">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight whitespace-nowrap">Clinic EZ</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === link.href ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-4">
          <SignedOut>
            <Link
              href="/sign-in"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/sync-auth"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors mr-2"
            >
              Dashboard
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden flex items-center justify-center text-foreground p-2"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border/40 bg-background absolute top-16 left-0 w-full shadow-xl">
          <div className="flex flex-col px-6 py-4 space-y-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-base font-medium py-2 transition-colors ${
                  pathname === link.href ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {link.name}
              </Link>
            ))}
            <div className="h-px bg-border my-2" />
            <SignedOut>
              <Link
                href="/sign-in"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-base font-medium text-foreground py-2"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setIsMobileMenuOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors mt-2"
              >
                Get Started
              </Link>
            </SignedOut>
            <SignedIn>
              <div className="flex items-center gap-4 py-2">
                <UserButton afterSignOutUrl="/" />
                <Link
                  href="/sync-auth"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-base font-medium text-foreground"
                >
                  Dashboard
                </Link>
              </div>
            </SignedIn>
          </div>
        </div>
      )}
    </header>
  );
}
