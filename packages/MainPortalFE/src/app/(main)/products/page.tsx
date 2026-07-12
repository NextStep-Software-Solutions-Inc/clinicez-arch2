import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { products } from "@/constants/products";
import Icon from "@/components/Icon";
export const metadata: Metadata = {
  title: "Products | Clinic EZ",
  description: "Explore the Clinic EZ product ecosystem.",
  keywords: ["healthcare products", "EMR software", "scheduling software", "e-prescriptions", "telehealth platform"],
  openGraph: {
    title: "Products | Clinic EZ",
    description: "Explore the Clinic EZ product ecosystem.",
    url: "https://clinicez.net/products",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.net/og-products.png",
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
    images: ["https://clinicez.net/og-products.png"],
  },
};



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
          {products.map((product) => {
            return (
              <div 
                key={product.id} 
                className="group flex flex-col rounded-3xl border border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className={`h-12 w-12 rounded-2xl bg-${product.primaryColor}/10 flex items-center justify-center text-${product.primaryColor} mb-6 transition-transform group-hover:scale-110`}>
                  <Icon name={product.icon} className="h-6 w-6" />
                </div>
                
                <h3 className="text-xl font-bold mb-3">{product.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-8 flex-grow">
                  {product.description}
                </p>

                <Link 
                  href={`/products/${product.slug}`}
                  className={`inline-flex items-center text-sm font-semibold text-${product.primaryColor} hover:opacity-80 transition-opacity`}
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
