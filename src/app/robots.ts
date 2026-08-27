import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing to hide, but the AI routes cost money per request and have no
      // business being crawled.
      disallow: ["/api/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
