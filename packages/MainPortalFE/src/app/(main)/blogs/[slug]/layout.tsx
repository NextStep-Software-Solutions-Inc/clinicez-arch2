import { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;
  
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";
    const res = await fetch(`${apiUrl}/blogs/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error("Article not found");
    const blog = await res.json();
    
    return {
      title: `${blog.title} | Clinic EZ Blog`,
      description: blog.summary,
      keywords: [blog.category, "Clinic EZ", "Health Tech", "Philippine EMR", "Clinic Management"],
      openGraph: {
        title: `${blog.title} | Clinic EZ Blog`,
        description: blog.summary,
        type: "article",
        url: `https://clinicez.com/blogs/${slug}`,
        images: blog.bannerUrl ? [{ url: blog.bannerUrl }] : []
      }
    };
  } catch (err) {
    return {
      title: "Clinic EZ Blog Article",
      description: "Read clinical practice guides, PhilHealth Konsulta accreditation roadmaps, and health tech product announcements on the Clinic EZ Blog."
    };
  }
}

export default function BlogDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
