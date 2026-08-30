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

let cached: Palette | null = null;

/** The one token block. There used to be two themes here; there is one now. */
export function getPalette(): Palette {
  if (cached) return cached;
  cached = extractBlock(readFileSync(CSS_PATH, "utf8"), /^:root\s*\{/m, "tokens");
  return cached;
}

/** OG cards render on the site's own ground, which is now the only one. */
export function ogPalette() {
  const t = getPalette();
  return {
    bg: t["--bg"],
    surface: t["--surface"],
    text: t["--text"],
    muted: t["--text-muted"],
    subtle: t["--text-subtle"],
    border: t["--border"],
    accent: t["--accent"],
  };
}
