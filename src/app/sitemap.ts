import type { MetadataRoute } from "next";
import { getAllProjects, getAllPosts } from "@/lib/content";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // /writing only exists as a route while there is something in it. Listing an
  // empty index in the sitemap invites a crawler to a page with nothing on it.
  const posts = getAllPosts();
  const staticRoutes = ["", "/projects", "/lab", "/resume"]
    .concat(posts.length > 0 ? ["/writing"] : []);

  return [
    ...staticRoutes.map((path) => ({
      url: `${SITE.url}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
    })),
    ...getAllProjects().map((p) => ({
      url: `${SITE.url}/projects/${p.slug}`,
      lastModified: new Date(p.finished ?? p.started),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({
      url: `${SITE.url}/writing/${p.slug}`,
      lastModified: new Date(p.updated ?? p.published),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
