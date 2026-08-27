import { ImageResponse } from "next/og";
import { ogPalette } from "@/lib/palette";
import { getAllProjects, getProject } from "@/lib/content";
import { SITE } from "@/lib/site";

export const alt = "Project";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllProjects().map((p) => ({ slug: p.slug }));
}

const STATUS_LABEL = {
  shipped: "Shipped",
  building: "In progress",
  planned: "Planned",
} as const;

/** In Next 16 the image-generating function receives `params` as a Promise,
 *  matching the async Request APIs change. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  const c = ogPalette();

  if (!project) {
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.bg,
            color: c.text,
            fontSize: 48,
          }}
        >
          {SITE.name}
        </div>
      ),
      size,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: c.bg,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor:
                  project.status === "planned" ? c.subtle : c.accent,
              }}
            />
            <div
              style={{
                fontSize: 22,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: project.status === "planned" ? c.subtle : c.accent,
              }}
            >
              {STATUS_LABEL[project.status]}
            </div>
          </div>

          <div
            style={{
              marginTop: 30,
              fontSize: project.title.length > 30 ? 62 : 76,
              lineHeight: 1.06,
              color: c.text,
              maxWidth: 1000,
            }}
          >
            {project.title}
          </div>

          {/* Satori has no line-clamp, so the pitch is trimmed here. The schema
              caps it at 200 chars, which fits comfortably. */}
          <div
            style={{
              marginTop: 26,
              fontSize: 29,
              lineHeight: 1.42,
              color: c.muted,
              maxWidth: 940,
            }}
          >
            {project.pitch}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: `2px solid ${c.border}`,
            paddingTop: 26,
          }}
        >
          <div style={{ fontSize: 27, color: c.text }}>{SITE.name}</div>
          <div style={{ fontSize: 23, color: c.subtle }}>
            {project.languages.slice(0, 3).join("  ·  ")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
