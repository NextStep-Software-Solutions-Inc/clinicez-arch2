import { joinApiUrl } from "@shared/safe";
import { getPortalApiUrl } from "@/utils/urls";
import {
  BlogDetailClient,
  type BlogArticleDetail,
} from "./_components/BlogDetailClient";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchInitialBlogDetail(slug: string): Promise<BlogArticleDetail | null> {
  try {
    const res = await fetch(joinApiUrl(getPortalApiUrl(), `/blogs/${encodeURIComponent(slug)}`), {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const initialBlog = await fetchInitialBlogDetail(slug);
  return <BlogDetailClient slug={slug} initialBlog={initialBlog} />;
}
