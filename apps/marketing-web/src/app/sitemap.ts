import { MetadataRoute } from "next";
import { joinApiUrl } from "@shared/safe";
import { getMarketingBaseUrl, getPortalApiUrl } from "@/utils/urls";

export const revalidate = 60;

interface SitemapBlogEntry {
  slug?: string;
  publishedAt?: string;
  createdAt?: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes = [
    "/",
    "/products",
    "/solution",
    "/solution/opd",
    "/solution/pharmacy",
    "/solution/laboratory",
    "/solution/philhealth",
    "/solution/accounting",
    "/solution/prescription",
    "/solution/medcert",
    "/solution/bed",
    "/pricing",
    "/about",
    "/careers",
    "/partners",
    "/contact-us",
    "/privacy",
    "/terms",
    "/hipaa",
    "/blogs",
    "/clinics",
    "/organizations",
    "/hp",
  ];

  const entries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: getMarketingBaseUrl(route),
    lastModified: now,
    changeFrequency: route === "/" || route === "/blogs" ? ("daily" as const) : ("weekly" as const),
    priority:
      route === "/"
        ? 1.0
        : route.startsWith("/products") || route.startsWith("/solution")
          ? 0.9
          : 0.7,
  }));

  try {
    const res = await fetch(joinApiUrl(getPortalApiUrl(), "/blogs"), {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const blogs = (await res.json().catch(() => [])) as SitemapBlogEntry[];
      if (Array.isArray(blogs)) {
        for (const blog of blogs) {
          if (blog?.slug) {
            entries.push({
              url: getMarketingBaseUrl(`/blogs/${encodeURIComponent(blog.slug)}`),
              lastModified: blog.publishedAt
                ? new Date(blog.publishedAt)
                : blog.createdAt
                  ? new Date(blog.createdAt)
                  : now,
              changeFrequency: "weekly",
              priority: 0.6,
            });
          }
        }
      }
    }
  } catch {
    // Gracefully omit dynamic blog URLs when portal-api is unreachable at build time
  }

  return entries;
}
