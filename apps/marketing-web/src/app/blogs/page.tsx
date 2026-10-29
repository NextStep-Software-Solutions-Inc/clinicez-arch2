import { joinApiUrl } from "@shared/safe";
import { getPortalApiUrl } from "@/utils/urls";
import { BlogsClient, type BlogArticleSummary } from "./_components/BlogsClient";

export const revalidate = 60;

async function fetchInitialBlogs(): Promise<BlogArticleSummary[]> {
  try {
    const res = await fetch(joinApiUrl(getPortalApiUrl(), "/blogs"), {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function BlogsPage() {
  const initialBlogs = await fetchInitialBlogs();
  return <BlogsClient initialBlogs={initialBlogs} />;
}
