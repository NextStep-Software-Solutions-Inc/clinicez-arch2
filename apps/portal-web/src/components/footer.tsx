import Link from "next/link";
import { Facebook, Twitter, Instagram, Linkedin, Heart } from "lucide-react";
import { ClinicEzLogo } from "@/components/ClinicEzLogo";
import { NewsletterForm } from "@/components/NewsletterForm";
import { socialLinks } from "@/config/site";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-background pt-16 pb-8">
      <div className="container mx-auto px-6 lg:px-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
          
          {/* Brand & Newsletter */}
          <div className="lg:col-span-2 flex flex-col">
            <Link href="/" className="flex items-center gap-2 group w-fit mb-6">
              <ClinicEzLogo className="h-7 w-auto" />
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-sm">
              The all-in-one unified portal for clinics, laboratories, and pharmacies. Modernize your healthcare facility today.
            </p>
            
            <h4 className="text-sm font-semibold mb-3">Subscribe to our newsletter</h4>
            <p className="text-xs text-muted-foreground mb-3 max-w-sm">
              Get the latest clinical insights, regulatory updates, and software releases delivered to your inbox.
            </p>
            <NewsletterForm />
          </div>

          {/* Links Column 1: Product */}
          <div className="flex flex-col">
            <h4 className="text-sm font-bold mb-6 text-foreground uppercase tracking-wider">Product</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/products" className="text-muted-foreground hover:text-primary transition-colors">Overview</Link></li>
              <li><Link href="/solution" className="text-muted-foreground hover:text-primary transition-colors">Solutions</Link></li>
              <li><Link href="/pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</Link></li>
              <li><Link href="/blogs" className="text-muted-foreground hover:text-primary transition-colors">Updates & Blogs</Link></li>
            </ul>
          </div>

          {/* Links Column 2: Company */}
          <div className="flex flex-col">
            <h4 className="text-sm font-bold mb-6 text-foreground uppercase tracking-wider">Company</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/careers" className="text-muted-foreground hover:text-primary transition-colors">Careers</Link></li>
              <li><Link href="/contact-us" className="text-muted-foreground hover:text-primary transition-colors">Contact</Link></li>
              <li><Link href="/partners" className="text-muted-foreground hover:text-primary transition-colors">Partners</Link></li>
            </ul>
          </div>

          {/* Links Column 3: Legal */}
          <div className="flex flex-col">
            <h4 className="text-sm font-bold mb-6 text-foreground uppercase tracking-wider">Legal</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="/hipaa" className="text-muted-foreground hover:text-primary transition-colors">HIPAA Compliance</Link></li>
            </ul>
          </div>

        </div>

        <div className="border-t border-border/50 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-1">
            <span>© {currentYear} Nextstep Software Corporation. Clinic EZ is a product of Nextstep Software Corporation.</span>
            <span className="hidden sm:inline">•</span>
            <span className="inline-flex items-center">Built with <Heart className="h-3.5 w-3.5 text-red-500 mx-1 fill-current" /> for healthcare.</span>
          </p>
          
          <div className="flex items-center gap-4 text-muted-foreground">
            <Link
              href={socialLinks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
              aria-label="Facebook"
            >
              <Facebook className="h-5 w-5" />
            </Link>
            <Link
              href={socialLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
              aria-label="Twitter"
            >
              <Twitter className="h-5 w-5" />
            </Link>
            <Link
              href={socialLinks.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="h-5 w-5" />
            </Link>
            <Link
              href={socialLinks.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
