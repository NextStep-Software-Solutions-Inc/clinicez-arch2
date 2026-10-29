"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { ClinicEzLogo } from "@/components/ClinicEzLogo";
import { getPortalAppUrl } from "@/utils/urls";

export function getNavigationAuthHrefs(hostname?: string) {
  return {
    loginHref: getPortalAppUrl("/sign-in", undefined, hostname),
    getStartedHref: getPortalAppUrl("/sign-up", undefined, hostname),
  };
}

export function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { loginHref, getStartedHref } = getNavigationAuthHrefs();

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
          <ClinicEzLogo
            markClassName="h-8 w-9 shrink-0 transition-transform group-hover:scale-105"
            textClassName="text-xl font-bold tracking-tight whitespace-nowrap"
          />
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
          <a
            href={loginHref}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Log in
          </a>
          <a
            href={getStartedHref}
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-colors"
          >
            Get Started
          </a>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          aria-label="Toggle navigation menu"
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
            <a
              href={loginHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-base font-medium text-foreground py-2"
            >
              Log in
            </a>
            <a
              href={getStartedHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors mt-2"
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
