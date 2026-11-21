import { Metadata } from "next";
import { absoluteUrl } from "@/config/site";
import { joinApiUrl } from "@shared/safe";
import { getPortalApiUrl } from "@/utils/urls";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;

  try {
    const res = await fetch(joinApiUrl(getPortalApiUrl(), `/blogs/${encodeURIComponent(slug)}`), {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
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
        url: absoluteUrl(`/blogs/${slug}`),
        images: blog.bannerUrl ? [{ url: blog.bannerUrl }] : [],
      },
    };
  } catch {
    return {
      title: "Clinic EZ Blog Article",
      description:
        "Read clinical practice guides, PhilHealth Konsulta accreditation roadmaps, and health tech product announcements on the Clinic EZ Blog.",
    };
  }
}

export default function BlogDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
