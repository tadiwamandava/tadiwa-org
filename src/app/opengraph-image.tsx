import { ImageResponse } from "next/og";
import { ogPalette } from "@/lib/palette";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name} — ${SITE.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Satori supports flexbox and a subset of CSS — no grid, no custom properties.
   Colours come from lib/palette.ts, which reads the real stylesheet, so this
   card can never drift from the site's palette.

   TODO: load Fraunces as an ArrayBuffer via the `fonts` option to match the
   site's display face. Rendering in the bundled default until then — a correct
   card in the wrong typeface beats no card. */

export default function Image() {
  const c = ogPalette();

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
            {SITE.role}
          </div>

          <div
            style={{
              marginTop: 34,
              fontSize: 82,
              lineHeight: 1.05,
              color: c.text,
              maxWidth: 900,
            }}
          >
            I build across the hardware/software boundary.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: 3,
              width: 132,
              backgroundColor: c.accent,
              marginBottom: 28,
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div style={{ fontSize: 30, color: c.text }}>{SITE.name}</div>
            <div style={{ fontSize: 24, color: c.subtle }}>tadiwa.org</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
