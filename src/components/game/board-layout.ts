/* ============================================================================
   board-layout.ts, the deterministic PCB floorplan.

   Pure maths, zero dependencies, no DOM and no canvas. Two consumers share it
   and must agree to the pixel:

     1. the renderer, which draws the copper; and
     2. the React overlay, which parks a real <a> on top of every chip.

   Because it is pure, the overlay keeps working if the renderer never loads,
   the canvas is decoration layered *under* the links, not the thing that
   positions them.

   HEIGHT. The stage's height is reserved by the stylesheet from the row count
   the shell hands it, and the solver fits the board into whatever box it is
   given. That direction matters: deriving the height here and writing it back
   onto the stage would be correct at rest but would move the page ~180px the
   moment the board went live, because the server-rendered fallback list is
   taller than the board. The one number both presentations must agree on is
   `rows`, and `balancedCols` below is what makes them agree.

   An earlier revision fixed the stage at `clamp(360px, 42vw, 540px)`, a guess
   that knew neither the project count nor the row count, so at 768px it clipped
   five of eleven cards behind an inner scrollbar. `benchRows()` replaces the
   guess.

   Coordinates are CSS pixels with the origin at the board's top-left. The
   renderer scales them to device pixels with a transform; nothing here knows
   about DPR.
   ========================================================================= */

export interface Point {
  x: number;
  y: number;
}

export interface ChipLayout {
  index: number;
  /** Footprint rect, top-left anchored, this is also the <a> hit target. */
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Pins drawn down each long edge. Cosmetic, but scaled to the package. */
  pinsPerSide: number;
  /**
   * The chip's net, ordered connector-end first. Sharing segments between chips
   * is intentional: they are on the same bus, and a pulse that runs the shared
   * copper before branching is what makes the board read as one circuit rather
   * than twelve unrelated squiggles.
   */
  path: Point[];
  /** cum[i] = arc length from path[0] to path[i]. */
  cum: number[];
  length: number;
}

export interface BoardLayout {
  width: number;
  height: number;
  pad: number;
  cols: number;
  rows: number;
  chips: ChipLayout[];
  /** Type scale for the label the overlay parks on a footprint, in px. */
  labelFont: number;
  /** How many lines of that label the footprint can hold before ellipsis. */
  labelLines: number;
  bus: { y: number; x0: number; x1: number };
  connector: { x: number; y: number; w: number; h: number; fingers: number };
  /** Plated through-holes at every net junction, plus stitching. */
  vias: Point[];
  /** Unconnected copper. A real board is never only the nets you care about. */
  deco: Point[][];
  mounts: Point[];
}

/* ---------------------------------------------------------------------------
   Legibility thresholds. Below these the board is illegible and the caller
   should render the plain HTML list instead, a cramped board is worse than no
   board, and every one of these numbers exists because a screenshot at some
   viewport was unreadable without it.
   ------------------------------------------------------------------------ */

/* A 600px stage is what a ~664px viewport gives, and it is the narrowest box in
   which three legible footprints fit. Below it the stylesheet has not reserved
   a board-shaped height either, so the two agree that there is no board. */
export const MIN_BOARD_WIDTH = 600;
export const MIN_BOARD_HEIGHT = 200;

/** A footprint narrower than this cannot hold a project title. Measured: at
    124px the 768px board rendered "DSP: Filter", "K20 Content", "Spaced-". */
const MIN_CHIP_W = 160;
const MAX_CHIP_W = 264;
const MIN_CHIP_H = 46;
const MAX_CHIP_H = 92;

/** Below this there is no routing channel left between one row and the next. */
const MIN_V_GUTTER = 26;

/** Past four rows the thing stops reading as a board and starts reading as a
    list with extra steps, at which point the actual list is the better answer. */
const MAX_ROWS = 4;

/** Four is also the ceiling on columns, and for a second reason: it is the cap
    the stylesheet's card grid uses, and the two must reach the same answer or
    the reserved height belongs to a row count the board does not use. Sharing
    `gridCost` is not enough; they have to share the candidate set too. */
export const MAX_COLS = 4;

/* Vertical furniture below the last row of chips. */
const CONNECTOR_H = 13;
const BUS_GAP = 34;
const CHANNEL = 26;

/* ---------------------------------------------------------------------------
   Column selection, one cost function, two consumers.

   Both the canvas board and the plain CSS card grid have to answer the same
   question: given n items and a ceiling on columns, how many columns look
   deliberate? The answer is dominated by what the LAST row does. Eleven items
   in five columns is 5/5/1, an orphan beside four empty cells, which is what
   the fallback grid used to render. Eleven in four is 4/4/3, which reads as a
   floorplan.

   cost = empty cells + 0.8·rows − 0.25·cols
          ^ orphans hurt   ^ tall hurts  ^ but so does wasting the width

   Ties go to more columns.
   ------------------------------------------------------------------------ */
export function gridCost(n: number, cols: number): number {
  const rows = Math.ceil(n / cols);
  return rows * cols - n + rows * 0.8 - cols * 0.25;
}

/**
 * The column count for a plain grid of `n` cards capped at `cap` columns.
 * Used by the CSS fallback, which has no measurements to work from, only the
 * project count, which is known on the server.
 */
export function balancedCols(n: number, cap: number): number {
  let best = 1;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= Math.min(cap, n); cols++) {
    const cost = gridCost(n, cols);
    if (cost <= bestCost) {
      bestCost = cost;
      best = cols;
    }
  }
  return best;
}

/** Rows the fallback card grid will use at that column cap. The stylesheet
    reserves `rows` card-heights of stage, so this is also the board's box. */
export function benchRows(n: number, cap: number): number {
  return Math.ceil(n / balancedCols(n, cap));
}

interface Fit {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  chipW: number;
  chipH: number;
  hGutter: number;
  vGutter: number;
}

/** The board's shape at a given column count, or null if it would be illegible. */
function fitColumns(
  n: number,
  gridW: number,
  gridH: number,
  cols: number,
): Fit | null {
  const rows = Math.ceil(n / cols);
  if (rows > MAX_ROWS) return null;

  const cellW = gridW / cols;
  const cellH = gridH / rows;
  const hGutter = clamp(cellW * 0.2, 16, 44);
  const chipW = Math.min(cellW - hGutter, MAX_CHIP_W);
  if (chipW < MIN_CHIP_W) return null;

  /* Two ceilings on the package height. `cellH * 0.54` keeps a routing channel
     between rows; `chipW * 0.46` keeps the package chip-shaped when the box is
     generous, a tall cell should buy more copper, not a squarer part. */
  const chipH = clamp(
    Math.round(Math.min(cellH * 0.54, chipW * 0.46)),
    MIN_CHIP_H,
    MAX_CHIP_H,
  );
  const vGutter = cellH - chipH;
  if (vGutter < MIN_V_GUTTER) return null;

  return {
    cols,
    rows,
    cellW,
    cellH,
    chipW: Math.round(chipW),
    chipH,
    hGutter,
    vGutter,
  };
}

/* ---------------------------------------------------------------------------
   Geometry helpers
   ------------------------------------------------------------------------ */

function dedupe(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) {
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Replaces every 90° corner with a 45° cut.
 *
 * This is the whole reason the board reads as a PCB and not as a subway map:
 * copper is mitred at 45° because a right-angle corner etches badly. The route
 * is authored as plain H/V segments and mitred here, so the routing code never
 * has to think about diagonals.
 */
function chamfer(pts: Point[], radius: number): Point[] {
  if (pts.length < 3) return pts.slice();

  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];

    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (d1 < 0.01 || d2 < 0.01) continue;

    const r = Math.min(radius, d1 * 0.5, d2 * 0.5);
    out.push({
      x: cur.x - ((cur.x - prev.x) / d1) * r,
      y: cur.y - ((cur.y - prev.y) / d1) * r,
    });
    out.push({
      x: cur.x + ((next.x - cur.x) / d2) * r,
      y: cur.y + ((next.y - cur.y) / d2) * r,
    });
  }
  out.push(pts[pts.length - 1]);

  return dedupe(out);
}

function measure(path: Point[]): { cum: number[]; length: number } {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    cum.push(total);
  }
  return { cum, length: total };
}

/** The point `s` units along a chip's net. Clamped at both ends. */
export function pointAt(chip: ChipLayout, s: number): Point {
  const { path, cum } = chip;
  if (s <= 0) return path[0];
  if (s >= chip.length) return path[path.length - 1];

  // Linear scan: paths are ~10 points, so a binary search costs more than it
  // saves and is one more thing to get wrong.
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= s) {
      const segLen = cum[i] - cum[i - 1];
      const t = segLen === 0 ? 0 : (s - cum[i - 1]) / segLen;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * t,
      };
    }
  }
  return path[path.length - 1];
}

/** The sub-polyline between two arc lengths, one travelling signal pulse. */
export function sliceAt(chip: ChipLayout, s0: number, s1: number): Point[] {
  const a = Math.max(0, Math.min(s0, s1));
  const b = Math.min(chip.length, Math.max(s0, s1));
  if (b - a < 0.5) return [];

  const out: Point[] = [pointAt(chip, a)];
  for (let i = 0; i < chip.path.length; i++) {
    if (chip.cum[i] > a && chip.cum[i] < b) out.push(chip.path[i]);
  }
  out.push(pointAt(chip, b));
  return dedupe(out);
}

/* ---------------------------------------------------------------------------
   The floorplan
   ------------------------------------------------------------------------ */

/**
 * @param width   measured width of the stage, in CSS pixels.
 * @param height  measured height of the stage, reserved by the stylesheet.
 * @param count   number of modules, 1–12.
 * @returns the floorplan, or `null` when this box cannot hold a legible board.
 *          `null` is a valid, expected answer: the caller falls back to the
 *          HTML list, which is already sitting in the same box.
 */
export function computeBoardLayout(
  width: number,
  height: number,
  count: number,
): BoardLayout | null {
  if (count < 1) return null;
  if (!Number.isFinite(width) || width < MIN_BOARD_WIDTH) return null;
  if (!Number.isFinite(height) || height < MIN_BOARD_HEIGHT) return null;

  const pad = clamp(Math.round(width * 0.028), 18, 40);

  const gridX = pad + 22;
  const gridW = width - 2 * gridX;
  const gridY = pad + 4;

  /* Bottom band: gold fingers flush with the board edge, a power/bus rail above
     them, and the routing channel above that. */
  const connectorH = CONNECTOR_H;
  const connectorW = clamp(Math.round(width * 0.17), 96, 200);
  const connectorY = height - connectorH;
  const connectorX = Math.round((width - connectorW) / 2);
  const connectorCx = connectorX + connectorW / 2;
  const busY = connectorY - BUS_GAP;

  const gridH = busY - CHANNEL - gridY;
  if (gridW <= 0 || gridH <= 0) return null;

  /* Pick the column count over the fits that are actually legible. If none is,
     no board exists in this box and the list wins. */
  let fit: Fit | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= Math.min(count, MAX_COLS); cols++) {
    const candidate = fitColumns(count, gridW, gridH, cols);
    if (!candidate) continue;
    const cost = gridCost(count, cols);
    if (cost <= bestCost) {
      bestCost = cost;
      fit = candidate;
    }
  }
  if (!fit) return null;

  const { cols, rows, cellW, cellH, chipW, chipH, hGutter, vGutter } = fit;

  /* Vertical spines live in the side margins; nets alternate sides by row so
     the two halves stay balanced and no feeder ever crosses a chip. */
  const spineL = pad;
  const spineR = width - pad;

  const chips: ChipLayout[] = [];
  const viaKeys = new Set<string>();
  const vias: Point[] = [];
  const addVia = (p: Point) => {
    const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
    if (viaKeys.has(key)) return;
    viaKeys.add(key);
    vias.push(p);
  };

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    /* A ragged last row is centred rather than left-aligned. Feeders are
       horizontal, so nothing downstream depends on columns lining up. */
    const inRow = Math.min(cols, count - row * cols);
    const rowOffset = ((cols - inRow) * cellW) / 2;

    const cellLeft = gridX + rowOffset + col * cellW;
    const cellTop = gridY + row * cellH;

    const x = Math.round(cellLeft + (cellW - chipW) / 2);
    /* The chip sits high in its cell so there is copper visible BELOW it. The
       previous revision centred it, which put the feeder exactly on the chip's
       bottom edge and made every drop segment zero-length, the traces grazed
       the packages instead of entering them. */
    const y = Math.round(cellTop + vGutter * 0.35);
    const cx = x + chipW / 2;
    const cy = y + chipH / 2;

    const spineX = row % 2 === 0 ? spineR : spineL;
    const feederY = Math.round(cellTop + cellH - vGutter * 0.3);
    /* Three pin positions cycled by index: identical drop points across a row
       looks printed, not routed. */
    const dropX = Math.round(cx + ((i % 3) - 1) * chipW * 0.28);

    const raw: Point[] = [
      { x: connectorCx, y: connectorY },
      { x: connectorCx, y: busY },
      { x: spineX, y: busY },
      { x: spineX, y: feederY },
      { x: dropX, y: feederY },
      { x: dropX, y: y + chipH },
    ];

    addVia({ x: spineX, y: busY });
    addVia({ x: spineX, y: feederY });
    addVia({ x: dropX, y: feederY });

    const path = chamfer(dedupe(raw), 9);
    const { cum, length } = measure(path);

    chips.push({
      index: i,
      x,
      y,
      w: chipW,
      h: chipH,
      cx,
      cy,
      pinsPerSide: clamp(Math.round(chipH / 11), 3, 8),
      path,
      cum,
      length,
    });
  }

  addVia({ x: connectorCx, y: busY });

  /* Unconnected copper in the horizontal gutters between chips. Cheap texture,
     and it stops the empty column lanes reading as a mistake. */
  const deco: Point[][] = [];
  const rnd = mulberry32(0x5eed ^ (count * 2654435761));
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(cols, count - row * cols);
    if (inRow <= 0) continue;
    const rowOffset = ((cols - inRow) * cellW) / 2;
    for (let g = 1; g < inRow; g++) {
      if (rnd() < 0.35) continue;
      const lane = gridX + rowOffset + g * cellW - hGutter * (0.35 + rnd() * 0.3);
      const top = gridY + row * cellH + vGutter * 0.4 + chipH * (0.1 + rnd() * 0.2);
      const bottom = top + chipH * (0.45 + rnd() * 0.4);
      const stub: Point[] = chamfer(
        [
          { x: lane, y: top },
          { x: lane, y: bottom },
          { x: lane + (rnd() < 0.5 ? -1 : 1) * hGutter * 0.5, y: bottom },
        ],
        5,
      );
      deco.push(stub);
      addVia(stub[0]);
      addVia(stub[stub.length - 1]);
    }
  }

  const mountR = Math.max(3, pad * 0.22);
  const mounts: Point[] = [
    { x: pad * 0.62, y: pad * 0.62 },
    { x: width - pad * 0.62, y: pad * 0.62 },
    { x: pad * 0.62, y: busY + 16 },
    { x: width - pad * 0.62, y: busY + 16 },
  ].filter((p) => p.x > mountR && p.y > mountR);

  /* Label metrics. The overlay's <a> is parked on the footprint, so how much
     text fits is a property of the footprint, computed once, here, rather than
     guessed by a media query that cannot see the chip. Budget: 12px of padding,
     ~15px for the designator line, 1px gap. */
  const labelFont = chipW >= 200 ? 11 : 10;
  const labelLines = clamp(
    Math.floor((chipH - 28) / (labelFont * 1.34)),
    1,
    3,
  );

  return {
    width,
    height,
    pad,
    cols,
    rows,
    chips,
    labelFont,
    labelLines,
    bus: { y: busY, x0: spineL, x1: spineR },
    connector: {
      x: connectorX,
      y: connectorY,
      w: connectorW,
      h: connectorH,
      fingers: clamp(Math.round(connectorW / 14), 5, 14),
    },
    vias,
    deco,
    mounts,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Deterministic PRNG, the same board on every paint, resize and reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
