import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList, Syringe, CalendarDays, Receipt, Users, Stethoscope } from "lucide-react";

export const metadata: Metadata = {
  title: "Products | Clinic EZ",
  description: "Explore the Clinic EZ product ecosystem.",
  keywords: ["healthcare products", "EMR software", "scheduling software", "e-prescriptions", "telehealth platform"],
  openGraph: {
    title: "Products | Clinic EZ",
    description: "Explore the Clinic EZ product ecosystem.",
    url: "https://clinicez.com/products",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.com/og-products.png",
        width: 1200,
        height: 630,
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Products | Clinic EZ",
    description: "Explore the Clinic EZ product ecosystem.",
    images: ["https://clinicez.com/og-products.png"],
  },
};

const products = [
  {
    name: "Patient Management (EMR)",
    icon: Users,
    description: "Centralized electronic medical records with complete patient history, allergies, and ongoing treatments accessible instantly.",
    href: "/products/emr"
  },
  {
    name: "Smart Scheduling",
    icon: CalendarDays,
    description: "Automated appointment booking, conflict resolution, and SMS reminders to drastically reduce patient no-shows.",
    href: "/products/scheduling"
  },
  {
    name: "E-Prescriptions",
    icon: Syringe,
    description: "Digitally sign and send prescriptions directly to partnered pharmacies or print them with QR validation.",
    href: "/products/prescriptions"
  },
  {
    name: "Billing & Invoicing",
    icon: Receipt,
    description: "Integrated financial module supporting multi-currency, PhilHealth processing, and automated tax calculations.",
    href: "/products/billing"
  },
  {
    name: "Clinical Notes",
    icon: ClipboardList,
    description: "Customizable charting templates for different specialties ensuring fast and compliant clinical documentation.",
    href: "/products/notes"
  },
  {
    name: "Teleconsultation",
    icon: Stethoscope,
    description: "Secure, WebRTC-powered high definition video calls integrated directly into the patient's appointment window.",
    href: "/products/telehealth"
  }
];

export default function ProductsPage() {
  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none -z-10" />

      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-4xl mx-auto">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6">
          Powerful modules. <br/>
          <span className="text-primary">One unified ecosystem.</span>
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Select only the modules you need. Clinic EZ products are deeply integrated, allowing you to build the perfect technology stack for your healthcare facility.
        </p>
      </section>

      <section className="py-12 px-6 lg:px-8 max-w-7xl mx-auto w-full mb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product, index) => {
            const Icon = product.icon;
            return (
              <div 
                key={index} 
                className="group flex flex-col rounded-3xl border border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 transition-transform group-hover:scale-110">
                  <Icon className="h-6 w-6" />
                </div>
                
                <h3 className="text-xl font-bold mb-3">{product.name}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-8 flex-grow">
                  {product.description}
                </p>

                <Link 
                  href={product.href}
                  className="inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Learn more
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
