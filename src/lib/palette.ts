import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the design tokens out of globals.css at build time.
 *
 * Open Graph images are rendered by Satori, which has no CSS custom properties
 * and no stylesheet, every colour must be a literal. The obvious move is to
 * paste the hex values into the OG component, and the obvious move is wrong for
 * the same reason it was wrong in the contrast checker: a second copy of the
 * palette drifts, and then link previews quietly render last month's brand.
 *
 * So there is exactly one palette in this repo, and it lives in the stylesheet.
 */

const CSS_PATH = join(process.cwd(), "src", "app", "globals.css");

export type Palette = Record<string, string>;

function extractBlock(css: string, selector: RegExp, label: string): Palette {
  const match = selector.exec(css);
  if (!match) throw new Error(`palette: could not find the ${label} block`);

  const start = css.indexOf("{", match.index);
  let depth = 0;
  let end = -1;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error(`palette: unterminated ${label} block`);

  const out: Palette = {};
  for (const d of css
    .slice(start + 1, end)
    .matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[d[1]] = d[2];
  }
  return out;
}

let cached: { light: Palette; dark: Palette } | null = null;

export function getPalette(): { light: Palette; dark: Palette } {
  if (cached) return cached;
  const css = readFileSync(CSS_PATH, "utf8");
  cached = {
    light: extractBlock(css, /^:root\s*\{/m, "light"),
    dark: extractBlock(css, /^:root\[data-theme="dark"\]\s*\{/m, "dark"),
  };
  return cached;
}

/** OG cards render on a dark ground, it reads consistently against both
 *  light and dark chrome in every social client. */
export function ogPalette() {
  const { dark } = getPalette();
  return {
    bg: dark["--bg"],
    surface: dark["--surface"],
    text: dark["--text"],
    muted: dark["--text-muted"],
    subtle: dark["--text-subtle"],
    border: dark["--border"],
    accent: dark["--accent"],
  };
}
