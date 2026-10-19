import { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl || "https://clinicez.com";
  const now = new Date();

  const routes = [
    "",
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
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" || route === "/blogs" ? ("daily" as const) : ("weekly" as const),
    priority: route === "" ? 1.0 : route.startsWith("/products") || route.startsWith("/solution") ? 0.9 : 0.7,
  }));
}
