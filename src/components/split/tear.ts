/**
 * The torn edge, as a reusable set of offsets.
 *
 * Two things matter here and both are easy to get wrong.
 *
 * The shape is generated ONCE and then translated. Regenerating noise on every
 * pointermove makes the edge crawl and shimmer under the hand, which reads as
 * a rendering fault rather than a tear. These offsets are computed at module
 * load and the drag only moves them sideways.
 *
 * The walk is correlated, not independent. Independent noise per point gives a
 * sawtooth, which looks like a zigzag border. Real paper fibres tear in runs,
 * so each step carries most of the previous offset and adds a small change,
 * with an occasional larger jump for the places a fibre lets go.
 */

/** Deterministic, so server and client agree and nothing re-rolls on reload. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/* Fewer points than the first attempt. 70 gave a wobble: each segment was so
   short that the walk averaged out and the edge read as noise on a straight
   line. A tear has fewer, longer facets. */
const POINTS = 34;

/** Horizontal deviation per point, in percentage points of the wrapper width. */
export const TEAR: ReadonlyArray<{ y: number; dx: number }> = (() => {
  const rand = seeded(0x7a1d);
  const out: { y: number; dx: number }[] = [];
  let dx = 0;
  for (let i = 0; i <= POINTS; i++) {
    const drift = (rand() - 0.5) * 0.9;
    // A fibre gives way: a long bite out of the sheet, or a tongue left
    // sticking out. Rare enough to read as an event rather than as noise,
    // large enough to see from across the room.
    const snap = rand() < 0.18 ? (rand() - 0.5) * 3.4 : 0;
    dx = dx * 0.62 + drift + snap;
    dx = Math.max(-2.2, Math.min(2.2, dx));
    // Pinned at both ends: a tear that starts mid-air at the top edge looks
    // like a clipping bug.
    const taper = Math.min(1, Math.min(i, POINTS - i) / 4);
    out.push({ y: (i / POINTS) * 100, dx: dx * taper });
  }
  return out;
})();

/** The clip for the left-hand layer, torn down its right edge at `pct`. */
export function tearClip(pct: number): string {
  const edge = TEAR.map((p) => `${(pct + p.dx).toFixed(3)}% ${p.y.toFixed(2)}%`);
  return `polygon(0% 0%, ${edge.join(", ")}, 0% 100%)`;
}
