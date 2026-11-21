import { MetadataRoute } from "next";
import { getMarketingBaseUrl } from "@/utils/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/*"],
      },
    ],
    sitemap: getMarketingBaseUrl("/sitemap.xml"),
  };
}
