import type { MetadataRoute } from "next";
import { getAllProjects, getAllPosts } from "@/lib/content";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/projects", "/lab", "/writing", "/resume"];

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
    ...getAllPosts().map((p) => ({
      url: `${SITE.url}/writing/${p.slug}`,
      lastModified: new Date(p.updated ?? p.published),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
