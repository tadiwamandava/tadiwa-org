/**
 * WCAG contrast + palette-separation gate.
 *
 * Parses the real token blocks out of src/app/globals.css rather than keeping a
 * copy of the palette here, a duplicated palette drifts from the stylesheet
 * and then this script certifies a theme nobody is actually shipping.
 *
 * Two families of assertion:
 *
 *   1. CONTRAST, WCAG AA ratios for text, and 1.4.11 for non-text UI.
 *
 *   2. SEPARATION, OKLab ΔE between tokens that must stay TELLABLE APART.
 *      The palette is deliberately one hue (see the header of globals.css):
 *      status is ranked by tone and the chart pair is an emphasis hierarchy.
 *      Contrast-vs-background alone cannot catch two of those collapsing into
 *      each other, two tokens can both sit at 5.5:1 on --bg and be the same
 *      colour. These checks are what replaces the old "is it green or is it
 *      rust" distinguishability that hue used to provide for free.
 *
 * Run: npm run check:contrast
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(HERE, "../src/app/globals.css");

type Palette = Record<string, string>;

/** AA thresholds. Large text is >=24px, or >=18.66px bold. */
const AA_BODY = 4.5;
const AA_LARGE = 3.0;
const AA_NON_TEXT = 3.0;

/**
 * Separation floors, in OKLab ΔE ×100, the same metric and scale the dataviz
 * validator uses, so numbers here are directly comparable to its output.
 *
 * DE_CHART (15) is that tool's normal-vision floor for a pair carrying meaning
 * through colour. It is a hard number: an earlier chart pick measured 11.7 and
 * was genuinely indistinguishable on screen.
 *
 * DE_STATUS (8) is lower on purpose. Status is never colour-only, <StatusPill>
 * always renders the word "Shipped" / "Building" / "Planned" next to the dot,
 * so colour only has to rank the three, not name them. 8 is the validator's
 * CVD floor band, i.e. the point where a difference is still perceptible when
 * a text label is doing the identifying.
 */
const DE_CHART = 15;
const DE_STATUS = 8;

// ---------------------------------------------------------------------------
// colour maths
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: "${hex}"`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channelToLinear(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB hex -> OKLab. Björn Ottosson's matrices, via linear sRGB. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map(channelToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Euclidean distance in OKLab, x100, matches the dataviz validator's ΔE. */
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------
// CSS extraction
// ---------------------------------------------------------------------------

/**
 * Pulls `--name: #hex;` declarations out of the first block whose selector line
 * matches `selectorPattern`. Deliberately dumb: the token blocks in globals.css
 * are flat lists of custom properties, so a real CSS parser buys nothing.
 */
function extractBlock(css: string, selectorPattern: RegExp, label: string): Palette {
  const match = selectorPattern.exec(css);
  if (!match) {
    throw new Error(`Could not find the ${label} token block in globals.css`);
  }
  const start = css.indexOf("{", match.index);
  if (start === -1) throw new Error(`Malformed ${label} block`);

  // Walk braces so a nested rule cannot truncate the block early.
  let depth = 0;
  let end = -1;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`Unterminated ${label} block`);

  const body = css.slice(start + 1, end);
  const palette: Palette = {};
  for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    palette[decl[1]] = decl[2];
  }
  if (Object.keys(palette).length === 0) {
    throw new Error(`No hex tokens found in the ${label} block`);
  }
  return palette;
}

// ---------------------------------------------------------------------------
// the contract
// ---------------------------------------------------------------------------

interface Check {
  fg: string;
  bg: string;
  min: number;
  note: string;
}

const CHECKS: Check[] = [
  // Body copy.
  { fg: "--text", bg: "--bg", min: AA_BODY, note: "body text on page" },
  { fg: "--text", bg: "--surface", min: AA_BODY, note: "body text on card" },
  { fg: "--text", bg: "--surface-2", min: AA_BODY, note: "body text on inset" },
  { fg: "--text-muted", bg: "--bg", min: AA_BODY, note: "secondary text" },
  { fg: "--text-muted", bg: "--surface", min: AA_BODY, note: "secondary on card" },
  { fg: "--text-muted", bg: "--surface-2", min: AA_BODY, note: "secondary on inset" },
  { fg: "--text-subtle", bg: "--bg", min: AA_BODY, note: "tertiary text" },
  { fg: "--text-subtle", bg: "--surface", min: AA_BODY, note: "tertiary on card" },
  { fg: "--text-subtle", bg: "--surface-2", min: AA_BODY, note: "tertiary on inset" },

  // Accent is used for links in running prose, so it must clear body contrast.
  // Inline <code> sits on --surface-2, and prose links run through it, so the
  // inset surface is checked too; it is the tightest of the three.
  { fg: "--accent", bg: "--bg", min: AA_BODY, note: "link on page" },
  { fg: "--accent", bg: "--surface", min: AA_BODY, note: "link on card" },
  { fg: "--accent", bg: "--surface-2", min: AA_BODY, note: "link on inset" },

  /* The one dark band. These pairs exist because their absence cost
     something: the assistant panel carried four hardcoded golds outside the
     token layer, so when the ground went from near-black to white this gate
     reported 27 passes while the panel's readout sat at 1.83:1. A colour the
     gate cannot see is a colour that breaks silently. */
  { fg: "--band-text", bg: "--band", min: AA_BODY, note: "text on the dark band" },
  { fg: "--band-muted", bg: "--band", min: AA_BODY, note: "secondary on the dark band" },
  { fg: "--band-accent", bg: "--band", min: AA_BODY, note: "accent on the dark band" },
  { fg: "--accent-contrast", bg: "--accent", min: AA_BODY, note: "text on accent fill" },
  { fg: "--text", bg: "--accent-subtle", min: AA_BODY, note: "text on tinted panel" },
  { fg: "--accent", bg: "--accent-subtle", min: AA_LARGE, note: "accent on tinted panel" },

  // Status pills carry meaning, so they are text, not decoration. They render
  // on cards (--surface) as often as on the page, so both are checked.
  { fg: "--status-shipped", bg: "--bg", min: AA_BODY, note: "status: shipped" },
  { fg: "--status-shipped", bg: "--surface", min: AA_BODY, note: "status: shipped on card" },
  { fg: "--status-building", bg: "--bg", min: AA_BODY, note: "status: building" },
  { fg: "--status-building", bg: "--surface", min: AA_BODY, note: "status: building on card" },
  { fg: "--status-planned", bg: "--bg", min: AA_BODY, note: "status: planned" },
  { fg: "--status-planned", bg: "--surface", min: AA_BODY, note: "status: planned on card" },

  // Non-text UI affordances (WCAG 1.4.11).
  { fg: "--focus", bg: "--bg", min: AA_NON_TEXT, note: "focus ring on page" },
  { fg: "--focus", bg: "--surface", min: AA_NON_TEXT, note: "focus ring on card" },
  // --border-strong identifies controls and draws the callout/quote rules,
  // which live on cards, so it has to clear 3:1 on --surface, not just --bg.
  { fg: "--border-strong", bg: "--bg", min: AA_NON_TEXT, note: "emphasised border" },
  { fg: "--border-strong", bg: "--surface", min: AA_NON_TEXT, note: "emphasised border on card" },

  // Benchmark bars are graphical objects conveying information.
  { fg: "--chart-mine", bg: "--bg", min: AA_NON_TEXT, note: "chart: subject bar" },
  { fg: "--chart-reference", bg: "--bg", min: AA_NON_TEXT, note: "chart: baseline bar" },
];

interface Separation {
  a: string;
  b: string;
  min: number;
  note: string;
}

/**
 * Tokens that must not collapse into one another. See DE_CHART / DE_STATUS.
 * Without these, "simplify the palette" has no floor: every status could drift
 * to the same value and every contrast check above would still pass.
 */
const SEPARATIONS: Separation[] = [
  {
    a: "--chart-mine",
    b: "--chart-reference",
    min: DE_CHART,
    note: "chart: subject vs baseline",
  },
  { a: "--status-shipped", b: "--status-building", min: DE_STATUS, note: "shipped vs building" },
  { a: "--status-shipped", b: "--status-planned", min: DE_STATUS, note: "shipped vs planned" },
  { a: "--status-building", b: "--status-planned", min: DE_STATUS, note: "building vs planned" },
];

function run(): number {
  const css = readFileSync(CSS_PATH, "utf8");

  // One theme, so one block. The parity check that used to live here compared
  // the media-query dark block against the [data-theme="dark"] block, because
  // a toggle and an OS preference rendering two different themes is a bug
  // nothing else would catch. There is no toggle now and no second block, so
  // the check has nothing to compare and is gone rather than left passing
  // vacuously.
  //
  // What replaces it: a token defined anywhere OTHER than bare :root is a
  // failure. That is the drift this file exists to prevent, and it is still
  // possible to reintroduce by hand.
  const themes: Array<{ name: string; palette: Palette }> = [
    { name: "dark", palette: extractBlock(css, /^:root\s*\{/m, "dark (:root)") },
  ];

  let failures = 0;

  const strays = [
    ...css.matchAll(/^(@media[^{]*|:root\[[^\]]+\])\s*\{/gm),
  ].filter((m) => {
    // Only care about blocks that actually define a colour token.
    const from = m.index ?? 0;
    return /--[\w-]+\s*:\s*#[0-9a-fA-F]{3,8}\s*;/.test(css.slice(from, from + 900));
  });
  console.log("\n  Single-theme structure");
  if (strays.length > 0) {
    failures += strays.length;
    for (const m of strays) {
      console.log(`  ✗ colour tokens defined outside :root, in \`${m[1].trim()}\``);
    }
  } else {
    console.log("  ✓ every colour token is defined once, on bare :root");
  }

  for (const { name, palette } of themes) {
    console.log(`\n  ${name.toUpperCase()} theme`);
    for (const check of CHECKS) {
      const fg = palette[check.fg];
      const bg = palette[check.bg];
      if (!fg || !bg) {
        failures++;
        console.log(`  ✗ ${check.note.padEnd(30)} missing token ${!fg ? check.fg : check.bg}`);
        continue;
      }
      const ratio = contrast(fg, bg);
      const pass = ratio >= check.min;
      if (!pass) failures++;
      const shown = ratio.toFixed(2).padStart(5);
      console.log(
        `  ${pass ? "✓" : "✗"} ${check.note.padEnd(30)} ${shown}:1 (min ${check.min})  ${check.fg} on ${check.bg}`,
      );
    }

    for (const sep of SEPARATIONS) {
      const a = palette[sep.a];
      const b = palette[sep.b];
      if (!a || !b) {
        failures++;
        console.log(`  ✗ ${sep.note.padEnd(30)} missing token ${!a ? sep.a : sep.b}`);
        continue;
      }
      const dist = deltaE(a, b);
      const pass = dist >= sep.min;
      if (!pass) failures++;
      const shown = dist.toFixed(1).padStart(5);
      console.log(
        `  ${pass ? "✓" : "✗"} ${sep.note.padEnd(30)} ΔE ${shown} (min ${sep.min})  ${sep.a} vs ${sep.b}`,
      );
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`  FAILED: ${failures} contrast/separation/parity problem(s).\n`);
    return 1;
  }
  console.log(
    `  PASSED: ${CHECKS.length} pairs meet WCAG AA and ` +
      `${SEPARATIONS.length * 2} pairs stay distinguishable.\n`,
  );
  return 0;
}

process.exit(run());
