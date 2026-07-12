import Link from "next/link";
import { Stethoscope, Facebook, Twitter, Instagram, Linkedin, Heart } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-background pt-16 pb-8">
      <div className="container mx-auto px-6 lg:px-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
          
          {/* Brand & Newsletter */}
          <div className="lg:col-span-2 flex flex-col">
            <Link href="/" className="flex items-center gap-2 group w-fit mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Stethoscope className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight">Clinic EZ</span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-sm">
              The all-in-one unified portal for clinics, laboratories, and pharmacies. Modernize your healthcare facility today.
            </p>
            
            <h4 className="text-sm font-semibold mb-3">Subscribe to our newsletter</h4>
            <div className="flex gap-2 w-full max-w-sm">
              <input 
                type="email" 
                placeholder="Enter your email" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button className="h-10 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Subscribe
              </button>
            </div>
          </div>

          {/* Links Column 1 */}
          <div className="flex flex-col">
            <h4 className="text-sm font-bold mb-6 text-foreground uppercase tracking-wider">Product</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/products" className="text-muted-foreground hover:text-primary transition-colors">Overview</Link></li>
              <li><Link href="/solution" className="text-muted-foreground hover:text-primary transition-colors">Solutions</Link></li>
              <li><Link href="/pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</Link></li>
              <li><Link href="/blogs" className="text-muted-foreground hover:text-primary transition-colors">Updates & Blogs</Link></li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div className="flex flex-col">
            <h4 className="text-sm font-bold mb-6 text-foreground uppercase tracking-wider">Company</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/careers" className="text-muted-foreground hover:text-primary transition-colors">Careers</Link></li>
              <li><Link href="/contact-us" className="text-muted-foreground hover:text-primary transition-colors">Contact</Link></li>
              <li><Link href="/partners" className="text-muted-foreground hover:text-primary transition-colors">Partners</Link></li>
            </ul>
          </div>

          {/* Links Column 3 */}
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
          <p className="text-sm text-muted-foreground flex items-center">
            © {currentYear} Clinic EZ. Built with <Heart className="h-4 w-4 text-red-500 mx-1 fill-current" /> for healthcare.
          </p>
          
          <div className="flex items-center gap-4 text-muted-foreground">
            <Link href="https://facebook.com" className="hover:text-primary transition-colors" aria-label="Facebook">
              <Facebook className="h-5 w-5" />
            </Link>
            <Link href="https://twitter.com" className="hover:text-primary transition-colors" aria-label="Twitter">
              <Twitter className="h-5 w-5" />
            </Link>
            <Link href="https://instagram.com" className="hover:text-primary transition-colors" aria-label="Instagram">
              <Instagram className="h-5 w-5" />
            </Link>
            <Link href="https://linkedin.com" className="hover:text-primary transition-colors" aria-label="LinkedIn">
              <Linkedin className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
