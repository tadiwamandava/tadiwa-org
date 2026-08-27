import { ImageResponse } from "next/og";
import { ogPalette } from "@/lib/palette";
import { getAllPosts, getPost } from "@/lib/content";
import { SITE } from "@/lib/site";

export const alt = "Post";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  const c = ogPalette();

  if (!post) {
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

  // Long titles are common in writing; step the size down rather than let
  // Satori overflow the card.
  const titleSize =
    post.title.length > 64 ? 52 : post.title.length > 40 ? 62 : 74;

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
          <div
            style={{
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: c.accent,
            }}
          >
            Writing
          </div>

          <div
            style={{
              marginTop: 30,
              fontSize: titleSize,
              lineHeight: 1.08,
              color: c.text,
              maxWidth: 1010,
            }}
          >
            {post.title}
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
            {`${post.published}  ·  ${post.readingTimeMinutes} min`}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
