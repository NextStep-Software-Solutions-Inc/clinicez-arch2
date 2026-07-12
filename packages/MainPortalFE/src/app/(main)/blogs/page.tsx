import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, User } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog & Insights | Clinic EZ",
  description: "Read the latest news, medical insights, and product updates from Clinic EZ.",
  keywords: ["healthcare blog", "medical practice management insights", "Clinic EZ updates", "health tech news"],
  openGraph: {
    title: "Blog & Insights | Clinic EZ",
    description: "Read the latest news, medical insights, and product updates from Clinic EZ.",
    url: "https://clinicez.net/blogs",
    siteName: "Clinic EZ",
    images: [
      {
        url: "https://clinicez.net/og-blogs.png",
        width: 1200,
        height: 630,
      }
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog & Insights | Clinic EZ",
    description: "Read the latest news, medical insights, and product updates from Clinic EZ.",
    images: ["https://clinicez.net/og-blogs.png"],
  },
};

const DUMMY_BLOGS = [
  {
    id: 1,
    title: "How to modernize your small clinic's patient queue in 2026",
    excerpt: "Patient wait times are the number one complaint in outpatient clinics. Learn how our new smart-queue system cuts wait times by 40%.",
    date: "July 12, 2026",
    author: "Dr. Maria Santos",
    category: "Practice Management",
    image: "bg-emerald-100" // Placeholder for an actual image
  },
  {
    id: 2,
    title: "Understanding HIPAA Compliance with Clerk Authentication",
    excerpt: "Security is non-negotiable in healthcare. We break down how Clinic EZ utilizes Clerk to ensure your patient data is completely secure.",
    date: "July 5, 2026",
    author: "Clinic EZ Engineering",
    category: "Security & Tech",
    image: "bg-teal-100"
  },
  {
    id: 3,
    title: "The Future of E-Prescriptions in Southeast Asia",
    excerpt: "With the rise of digital healthcare, e-prescriptions are becoming mandatory in many regions. Here is what you need to know to stay compliant.",
    date: "June 28, 2026",
    author: "James Rivera",
    category: "Industry News",
    image: "bg-emerald-50"
  }
];

export default function BlogsPage() {
  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[20%] w-[60%] h-[30%] rounded-full bg-primary/10 blur-[120px] pointer-events-none -z-10" />

      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6">
          Insights & Updates
        </h1>
        <p className="text-lg text-muted-foreground">
          Discover best practices, industry trends, and the latest product features directly from the Clinic EZ team.
        </p>
      </section>

      <section className="py-12 px-6 lg:px-8 max-w-7xl mx-auto w-full mb-24">
        
        {/* Featured Post (First one) */}
        <div className="mb-16 group relative overflow-hidden rounded-3xl border border-border bg-card transition-all hover:shadow-2xl hover:shadow-primary/5 flex flex-col md:flex-row">
          <div className={`md:w-1/2 min-h-[300px] ${DUMMY_BLOGS[0].image} flex items-center justify-center`}>
            <span className="text-muted-foreground font-medium">Featured Image Placeholder</span>
          </div>
          <div className="md:w-1/2 p-8 lg:p-12 flex flex-col justify-center">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4 w-fit">
              {DUMMY_BLOGS[0].category}
            </span>
            <h2 className="text-3xl font-bold mb-4 group-hover:text-primary transition-colors">
              {DUMMY_BLOGS[0].title}
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              {DUMMY_BLOGS[0].excerpt}
            </p>
            <div className="flex items-center text-sm text-muted-foreground mb-8">
              <div className="flex items-center mr-6">
                <User className="h-4 w-4 mr-2" />
                {DUMMY_BLOGS[0].author}
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                {DUMMY_BLOGS[0].date}
              </div>
            </div>
            <Link 
              href={`/blogs/${DUMMY_BLOGS[0].id}`}
              className="inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80 transition-colors mt-auto w-fit"
            >
              Read full article
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Other Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {DUMMY_BLOGS.slice(1).map((blog) => (
            <div 
              key={blog.id} 
              className="group flex flex-col rounded-3xl border border-border bg-card overflow-hidden transition-all hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1"
            >
              <div className={`h-48 w-full ${blog.image} flex items-center justify-center`}>
                <span className="text-muted-foreground text-sm font-medium">Image Placeholder</span>
              </div>
              
              <div className="p-6 flex flex-col flex-grow">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary mb-4 w-fit">
                  {blog.category}
                </span>
                
                <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                  {blog.title}
                </h3>
                
                <p className="text-muted-foreground text-sm leading-relaxed mb-6 line-clamp-3">
                  {blog.excerpt}
                </p>

                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">{blog.author}</span>
                  <span>{blog.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </section>
    </main>
  );
}
