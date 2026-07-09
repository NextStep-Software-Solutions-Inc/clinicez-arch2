import { Metadata } from "next";
import { Building2, Stethoscope, FlaskConical, Pill, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Solutions | Clinic EZ",
  description: "Tailored healthcare management solutions for Clinics, Hospitals, and Pharmacies.",
  keywords: ["healthcare solutions", "hospital management", "clinic software", "pharmacy POS", "LIS integration"],
  openGraph: {
    title: "Solutions | Clinic EZ",
    description: "Tailored healthcare management solutions for Clinics, Hospitals, and Pharmacies.",
    url: "https://clinicez.net/solution",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.net/og-solutions.png",
        width: 1200,
        height: 630,
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solutions | Clinic EZ",
    description: "Tailored healthcare management solutions for Clinics, Hospitals, and Pharmacies.",
    images: ["https://clinicez.net/og-solutions.png"],
  },
};

const solutions = [
  {
    title: "For Small Clinics",
    icon: Stethoscope,
    description: "Streamline your daily operations, patient queues, and electronic health records with an intuitive interface designed for rapid adoption.",
    features: ["Patient Queue Management", "Digital Prescriptions", "Billing & Invoicing", "Telehealth Ready"]
  },
  {
    title: "For Hospitals",
    icon: Building2,
    description: "Enterprise-scale architecture to handle complex multi-department workflows, comprehensive analytics, and vast patient databases.",
    features: ["Multi-department Routing", "Advanced Bed Management", "ERP Integration", "Role-based Access Control"]
  },
  {
    title: "For Laboratories",
    icon: FlaskConical,
    description: "Connect diagnostic machines directly to patient records. Automate result generation and dispatch securely.",
    features: ["LIS Integration", "Automated Reporting", "Sample Tracking", "Quality Control Logs"]
  },
  {
    title: "For Pharmacies",
    icon: Pill,
    description: "Real-time inventory management, automated low-stock alerts, and integrated point-of-sale systems.",
    features: ["Inventory Tracking", "Supplier Management", "POS Integration", "Expiry Date Alerts"]
  }
];

export default function SolutionsPage() {
  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute top-[10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none -z-10" />
      <div className="absolute top-[40%] right-[-10%] w-[30%] h-[30%] rounded-full bg-accent/20 blur-[100px] pointer-events-none -z-10" />

      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-4xl mx-auto relative z-10">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 text-foreground">
          Solutions for every <span className="text-primary">healthcare</span> scale.
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Whether you are a solo practitioner or a multi-branch hospital network, Clinic EZ adapts to your workflow with precision and scale.
        </p>
      </section>

      <section className="py-16 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          {solutions.map((solution, index) => {
            const Icon = solution.icon;
            return (
              <div 
                key={index} 
                className="group relative flex flex-col rounded-3xl border border-border/50 bg-background/40 backdrop-blur-xl p-8 lg:p-10 transition-all hover:shadow-2xl hover:shadow-primary/5"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100 rounded-3xl" />
                
                <div className="flex items-center gap-4 mb-6 relative z-10">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h2 className="text-2xl font-bold">{solution.title}</h2>
                </div>
                
                <p className="text-muted-foreground mb-8 leading-relaxed relative z-10">
                  {solution.description}
                </p>

                <div className="mt-auto relative z-10">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">Key Features</h4>
                  <ul className="space-y-3">
                    {solution.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 mr-3 shrink-0" />
                        <span className="text-sm font-medium">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
