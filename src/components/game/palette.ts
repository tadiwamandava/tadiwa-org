/* ============================================================================
   palette.ts, reads the board's colours out of the live cascade.

   Nothing in the canvas hardcodes a colour. What it reads are the `--board-*`
   role aliases defined in bench.module.css, NOT the design tokens directly:
   the board is a dark object in both themes, so which token plays "substrate"
   depends on the theme, and that decision belongs in the stylesheet next to the
   contrast working that justifies it, not in TypeScript.

   Read off the canvas element rather than <html>, because that is where the
   aliases resolve. The theme can still flip under us at any moment via
   `<html data-theme>`, so ask again whenever the answer might have changed.
   ========================================================================= */

export const TOKENS = [
  /** Substrate, the soldermask the whole board is printed on. */
  "board-ground",
  /** Package bodies and the connector housing: one step off the substrate. */
  "board-ground-2",
  /** Copper: traces, pins, annular rings, gold fingers, the silkscreen frame. */
  "board-copper",
  /** Drilled through to the page behind, mounting holes. */
  "board-hole",
  /** The only colour event on the board: energised net, pulses, LED, probe. */
  "board-live",
] as const;

export type TokenName = (typeof TOKENS)[number];
export type Palette = Record<TokenName, number>;

/* A 1×1 canvas is the only colour parser guaranteed to agree with the browser
   that is about to render these pixels. Tokens are hex today, but the team is
   mid-refactor and oklch()/color-mix() must not break the board, so the hex
   fast path falls through to the browser rather than to a guess. */
let probe: CanvasRenderingContext2D | null | undefined;

function parseColor(raw: string, fallback: number): number {
  const value = raw.trim();
  if (!value) return fallback;

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(value);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return (r << 16) | (g << 8) | b;
    }
    if (h.length === 6 || h.length === 8) {
      return parseInt(h.slice(0, 6), 16);
    }
  }

  if (probe === undefined) {
    probe =
      document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      }) ?? null;
  }
  if (!probe) return fallback;

  try {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "#000000";
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return (r << 16) | (g << 8) | b;
  } catch {
    return fallback;
  }
}

/* Only ever used if a token is missing entirely, i.e. the stylesheet failed to
   load, in which case the whole page is already broken. Neutral greys, so a
   half-loaded board is never a colour the design does not own. */
const FALLBACK: Palette = {
  "board-ground": 0x1a1a1a,
  "board-ground-2": 0x232323,
  "board-copper": 0x777777,
  "board-hole": 0x111111,
  "board-live": 0x888888,
};

export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const out = {} as Palette;
  for (const token of TOKENS) {
    out[token] = parseColor(style.getPropertyValue(`--${token}`), FALLBACK[token]);
  }
  return out;
}

export function paletteEquals(a: Palette, b: Palette): boolean {
  return TOKENS.every((t) => a[t] === b[t]);
}

/**
 * Fires whenever the resolved palette may have changed.
 *
 * Two triggers, because the theme has three states: an explicit choice writes
 * `data-theme` on <html>, and "system" writes nothing at all, so the OS
 * preference change is the only signal for the default case.
 */
export function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class"],
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}
