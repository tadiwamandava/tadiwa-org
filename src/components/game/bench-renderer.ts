/* ============================================================================
   bench-renderer.ts — the copper.

   Draws the board on a plain 2D canvas. This module owns the only animation
   loop on the page and nothing else in the app imports it.

   WHY NOT PHASER. The previous revision drew exactly these shapes through
   Phaser's Graphics API, and shipped 1.15 MB (312 kB gzipped) of game framework
   to do it — the largest chunk on the site by a factor of five, and more than
   half of all the JavaScript. Its config disabled input, audio, physics and
   every scale manager; there are no textures, no sprites, no tilemaps, no
   scene stack and no preload phase. Every call in the old scene was a
   one-to-one alias for a CanvasRenderingContext2D call. The framework was
   carrying a `lineTo`. So the board stayed and the framework went.

   Structure:
     · the static board (substrate, copper, packages) is etched ONCE into an
       offscreen canvas and blitted per frame;
     · only the four things that move — the energised net, the pulses, the
       active package and the probe — are drawn live.

   The loop sleeps aggressively. It runs only while the board is on screen, the
   tab is visible, and motion is allowed; anything else gets a single repaint
   per state change and no rAF at all.
   ========================================================================= */

import { pointAt, sliceAt, type BoardLayout, type Point } from "./board-layout";
import type { Palette } from "./palette";
import type { ProbeTarget } from "./types";

interface Pulse {
  chip: number;
  /** Arc length travelled from the connector end. */
  s: number;
  speed: number;
  len: number;
  alpha: number;
}

const MAX_PULSES = 16;

type Ctx = CanvasRenderingContext2D;

export class BenchRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: Ctx;
  /** Static board, etched on layout/palette change and blitted per frame. */
  private base: HTMLCanvasElement;
  private baseCtx: Ctx;

  private probe: { current: ProbeTarget };
  private layout: BoardLayout;
  private palette: Palette;
  private hex: Record<string, string>;
  private dpr: number;

  private activeIndex: number | null = null;
  private reduced = false;

  private pulses: Pulse[] = [];
  private idleTimer = 240;
  private liveTimer = 0;
  private rotor = 0;

  private probeX: number;
  private probeY: number;
  private probeAlpha = 0;
  private phase = 0;

  private baseDirty = true;
  private raf = 0;
  private last = 0;
  private onScreen = true;
  private destroyed = false;
  private painted = false;
  private onFirstPaint?: () => void;

  private io?: IntersectionObserver;

  constructor(
    canvas: HTMLCanvasElement,
    probe: { current: ProbeTarget },
    layout: BoardLayout,
    palette: Palette,
    dpr: number,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;

    this.base = document.createElement("canvas");
    const baseCtx = this.base.getContext("2d", { alpha: true });
    if (!baseCtx) throw new Error("2d context unavailable");
    this.baseCtx = baseCtx;

    this.probe = probe;
    this.layout = layout;
    this.palette = palette;
    this.hex = toHex(palette);
    this.dpr = dpr;
    this.probeX = layout.width / 2;
    this.probeY = layout.height / 2;

    this.resizeSurfaces();

    /* The loop is not allowed to burn a frame budget on a board nobody is
       looking at. Both of these are torn down in destroy(). */
    if (typeof IntersectionObserver === "function") {
      this.io = new IntersectionObserver(
        (entries) => {
          const next = entries.some((e) => e.isIntersecting);
          if (next === this.onScreen) return;
          this.onScreen = next;
          this.schedule();
        },
        { rootMargin: "120px 0px" },
      );
      this.io.observe(canvas);
    }
    document.addEventListener("visibilitychange", this.onVisibility);

    this.schedule();
  }

  /* ---------------------------------------------------------------------
     Imperative surface — everything React is allowed to say to the board.
     ------------------------------------------------------------------ */

  setActive(index: number | null): void {
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    if (index !== null && !this.reduced) {
      this.spawn(index, 520, 60, 1);
      this.liveTimer = 300;
    }
    this.schedule();
  }

  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reduced) return;
    this.reduced = reduced;
    if (reduced) {
      this.pulses.length = 0;
      // Snap, do not ease: under `reduce` the probe must not travel.
      const t = this.probe.current;
      this.probeX = t.x;
      this.probeY = t.y;
      this.probeAlpha = t.visible ? 1 : 0;
    }
    this.schedule();
  }

  setLayout(layout: BoardLayout, dpr: number): void {
    this.layout = layout;
    this.dpr = dpr;
    this.pulses.length = 0;
    this.probeX = clampNum(this.probeX, 0, layout.width);
    this.probeY = clampNum(this.probeY, 0, layout.height);
    this.resizeSurfaces();
    this.baseDirty = true;
    this.schedule();
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.hex = toHex(palette);
    this.baseDirty = true;
    this.schedule();
  }

  /** Fired once, after the first frame is actually on the canvas. */
  whenPainted(fn: () => void): void {
    if (this.painted) fn();
    else this.onFirstPaint = fn;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.io?.disconnect();
    this.io = undefined;
    document.removeEventListener("visibilitychange", this.onVisibility);
    // Drop the backing stores rather than waiting for GC to notice two canvases.
    this.base.width = 0;
    this.base.height = 0;
  }

  /* ---------------------------------------------------------------------
     Loop
     ------------------------------------------------------------------ */

  private onVisibility = () => this.schedule();

  /** True while the board has something to animate. */
  private get animating(): boolean {
    return !this.reduced && this.onScreen && !document.hidden;
  }

  private schedule(): void {
    if (this.destroyed || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    if (this.destroyed) return;

    const delta = this.last ? Math.min(now - this.last, 48) : 16;
    this.last = now;

    if (this.baseDirty) {
      this.etchBase();
      this.baseDirty = false;
    }

    if (this.animating) {
      this.phase += delta;
      this.stepProbe(delta);
      this.stepPulses(delta);
    } else {
      // One settled frame: the highlight is a state, not a transition, so it
      // still has to be correct with the loop stopped.
      const t = this.probe.current;
      this.probeX = t.x;
      this.probeY = t.y;
      this.probeAlpha = t.visible ? 1 : 0;
      this.pulses.length = 0;
    }

    this.paint();

    if (!this.painted) {
      this.painted = true;
      this.onFirstPaint?.();
    }

    if (this.animating) this.schedule();
    else this.last = 0;
  };

  /* ---------------------------------------------------------------------
     Simulation
     ------------------------------------------------------------------ */

  private stepProbe(dt: number): void {
    const target = this.probe.current;
    // Exponential ease expressed per-millisecond, so it is frame-rate
    // independent — a 144Hz display must not chase the pointer twice as fast.
    const k = 1 - Math.exp(-dt / 62);
    this.probeX += (target.x - this.probeX) * k;
    this.probeY += (target.y - this.probeY) * k;
    this.probeAlpha +=
      ((target.visible ? 1 : 0) - this.probeAlpha) * (1 - Math.exp(-dt / 90));
  }

  private stepPulses(dt: number): void {
    const chips = this.layout.chips;

    /* Idle traffic. Density is per-board, not per-chip, so a twelve-chip board
       is not twelve times busier than a one-chip board. */
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.idleTimer = 420 + Math.random() * 900;
      this.rotor = (this.rotor + 1 + Math.floor(Math.random() * 2)) % chips.length;
      this.spawn(this.rotor, 170 + Math.random() * 90, 30, 0.5);
    }

    if (this.activeIndex !== null) {
      this.liveTimer -= dt;
      if (this.liveTimer <= 0) {
        this.liveTimer = 330;
        this.spawn(this.activeIndex, 520, 60, 1);
      }
    }

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.s += (p.speed * dt) / 1000;
      const chip = chips[p.chip];
      if (!chip || p.s - p.len > chip.length) this.pulses.splice(i, 1);
    }
  }

  private spawn(chipIndex: number, speed: number, len: number, alpha: number): void {
    if (this.pulses.length >= MAX_PULSES) return;
    if (!this.layout.chips[chipIndex]) return;
    this.pulses.push({ chip: chipIndex, s: 0, speed, len, alpha });
  }

  /* ---------------------------------------------------------------------
     Surfaces
     ------------------------------------------------------------------ */

  private resizeSurfaces(): void {
    const { width, height } = this.layout;
    const w = Math.max(1, Math.round(width * this.dpr));
    const h = Math.max(1, Math.round(height * this.dpr));
    for (const c of [this.canvas, this.base]) {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    }
    /* The board is authored in CSS pixels; the transform is the only place DPR
       exists, which is what keeps hairlines crisp on retina without any of the
       layout maths knowing about it. */
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.baseCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.baseCtx.lineCap = "round";
    this.baseCtx.lineJoin = "round";
    this.baseDirty = true;
  }

  /* ---------------------------------------------------------------------
     Painting
     ------------------------------------------------------------------ */

  private paint(): void {
    const g = this.ctx;
    const { width, height } = this.layout;
    g.clearRect(0, 0, width, height);
    g.globalAlpha = 1;
    /* One blit for substrate + copper + packages. drawImage takes the device-
       pixel bitmap, so the destination rect is in CSS pixels under our
       transform and the two surfaces line up exactly. */
    g.drawImage(this.base, 0, 0, width, height);

    this.paintActiveChip(g);
    this.paintLiveNet(g);
    this.paintPulses(g);
    this.paintProbe(g);
    g.globalAlpha = 1;
  }

  private etchBase(): void {
    const g = this.baseCtx;
    const { width, height } = this.layout;
    g.clearRect(0, 0, width, height);
    this.paintSubstrate(g);
    this.paintTraces(g);
    for (const chip of this.layout.chips) this.paintChip(g, chip, false);
  }

  private paintSubstrate(g: Ctx): void {
    const { width, height, pad, bus, connector, mounts } = this.layout;
    const c = this.hex;

    fill(g, c["board-ground"], 1);
    g.fillRect(0, 0, width, height);

    /* Ground pour, drawn as 45° hatch. The only pure texture on the board; at
       `--border` over `--surface` it sits barely above the noise floor in
       either theme, which is the point — it should read as material, not as a
       pattern competing with the traces. */
    stroke(g, c["board-ground-2"], 1, 1);
    g.beginPath();
    for (let x = -height; x < width; x += 13) {
      g.moveTo(x, 0);
      g.lineTo(x + height, height);
    }
    g.stroke();

    // Silkscreen frame.
    const inset = pad * 0.45;
    stroke(g, c["board-copper"], 1, 0.3);
    roundRect(g, inset, inset, width - inset * 2, bus.y + 16 - inset, 6);
    g.stroke();

    // Mounting holes, filled with the page background: drilled through.
    const r = Math.max(3, pad * 0.22);
    for (const m of mounts) {
      fill(g, c["board-hole"], 1);
      circle(g, m.x, m.y, r);
      g.fill();
      stroke(g, c["board-copper"], 1.2, 0.55);
      circle(g, m.x, m.y, r);
      g.stroke();
    }

    // Edge connector: gold fingers running off the bottom of the board.
    fill(g, c["board-ground-2"], 1);
    g.fillRect(connector.x - 5, connector.y - 5, connector.w + 10, connector.h + 5);
    stroke(g, c["board-copper"], 1, 0.5);
    g.strokeRect(connector.x - 5, connector.y - 5, connector.w + 10, connector.h + 5);

    const pitch = connector.w / connector.fingers;
    fill(g, c["board-copper"], 0.85);
    for (let i = 0; i < connector.fingers; i++) {
      g.fillRect(
        connector.x + i * pitch + pitch * 0.16,
        connector.y - 1,
        pitch * 0.68,
        connector.h + 1,
      );
    }
  }

  private paintTraces(g: Ctx): void {
    const c = this.hex;

    /* Chips share copper, so the raw polylines overlap. Stroking them straight
       would stack alpha and leave the trunk looking blotchy — dedupe to unique
       segments first and every millimetre of trace is drawn exactly once. */
    const segments = uniqueSegments([
      ...this.layout.chips.map((chip) => chip.path),
      ...this.layout.deco,
    ]);

    stroke(g, c["board-copper"], 1.7, 0.62);
    g.beginPath();
    for (const [a, b] of segments) {
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke();

    // Vias: annular rings, drilled back to the substrate colour.
    for (const v of this.layout.vias) {
      fill(g, c["board-copper"], 0.75);
      circle(g, v.x, v.y, 3.1);
      g.fill();
      fill(g, c["board-ground"], 1);
      circle(g, v.x, v.y, 1.3);
      g.fill();
    }
  }

  private paintChip(
    g: Ctx,
    chip: BoardLayout["chips"][number],
    isActive: boolean,
  ): void {
    const c = this.hex;

    // Pins first, so the package body overlaps their inboard ends.
    fill(g, c["board-copper"], isActive ? 1 : 0.8);
    const step = chip.h / (chip.pinsPerSide + 1);
    for (let i = 1; i <= chip.pinsPerSide; i++) {
      const py = chip.y + step * i - 1.4;
      g.fillRect(chip.x - 6, py, 8, 2.8);
      g.fillRect(chip.x + chip.w - 2, py, 8, 2.8);
    }

    fill(g, c["board-ground-2"], 1);
    roundRect(g, chip.x, chip.y, chip.w, chip.h, 4);
    g.fill();

    if (isActive) {
      stroke(g, c["board-live"], 1.8, 1);
      roundRect(g, chip.x, chip.y, chip.w, chip.h, 4);
      g.stroke();
      // Soft halo: three passes rather than a shader.
      for (let i = 1; i <= 3; i++) {
        stroke(g, c["board-live"], 1.5, 0.16 / i);
        roundRect(
          g,
          chip.x - i * 2.5,
          chip.y - i * 2.5,
          chip.w + i * 5,
          chip.h + i * 5,
          4 + i * 2,
        );
        g.stroke();
      }
    } else {
      stroke(g, c["board-copper"], 1.1, 0.85);
      roundRect(g, chip.x, chip.y, chip.w, chip.h, 4);
      g.stroke();
    }

    // Pin-1 marker, bottom-left, the way a real package is keyed.
    fill(g, c["board-copper"], isActive ? 0.9 : 0.6);
    circle(g, chip.x + 7, chip.y + chip.h - 7, 2);
    g.fill();

    // Status LED. There is one accent in the palette, so "live" is the only
    // colour event on the board and it can only ever mean one thing.
    fill(g, isActive ? c["board-live"] : c["board-copper"], isActive ? 1 : 0.5);
    circle(g, chip.x + chip.w - 8, chip.y + 7, 2.4);
    g.fill();
  }

  private paintActiveChip(g: Ctx): void {
    if (this.activeIndex === null) return;
    const chip = this.layout.chips[this.activeIndex];
    if (chip) this.paintChip(g, chip, true);
  }

  private paintLiveNet(g: Ctx): void {
    if (this.activeIndex === null) return;
    const chip = this.layout.chips[this.activeIndex];
    if (!chip) return;

    const c = this.hex;
    stroke(g, c["board-live"], 5.5, 0.1);
    polyline(g, chip.path);
    stroke(g, c["board-live"], 2.2, 0.9);
    polyline(g, chip.path);

    // Re-drill the vias this net passes through, so the copper reads continuous.
    for (const v of this.layout.vias) {
      if (!onPath(chip.path, v)) continue;
      fill(g, c["board-live"], 0.95);
      circle(g, v.x, v.y, 3.1);
      g.fill();
      fill(g, c["board-ground"], 1);
      circle(g, v.x, v.y, 1.3);
      g.fill();
    }
  }

  private paintPulses(g: Ctx): void {
    const c = this.hex;

    for (const pulse of this.pulses) {
      const chip = this.layout.chips[pulse.chip];
      if (!chip) continue;

      // Four tapered links rather than one flat stroke: the taper is what makes
      // it read as a signal with a direction instead of a sliding dash.
      const links = 4;
      for (let i = 0; i < links; i++) {
        const s1 = pulse.s - (pulse.len * i) / links;
        const s0 = pulse.s - (pulse.len * (i + 1)) / links;
        const seg = sliceAt(chip, s0, s1);
        if (seg.length < 2) continue;
        const fade = 1 - i / links;
        stroke(g, c["board-live"], 1.4 + fade * 1.6, pulse.alpha * fade * 0.95);
        polyline(g, seg);
      }

      if (pulse.s <= chip.length) {
        const head = pointAt(chip, pulse.s);
        fill(g, c["board-live"], pulse.alpha);
        circle(g, head.x, head.y, 2.3);
        g.fill();
        fill(g, c["board-live"], pulse.alpha * 0.18);
        circle(g, head.x, head.y, 6);
        g.fill();
      }
    }
  }

  private paintProbe(g: Ctx): void {
    if (this.probeAlpha < 0.02) return;

    const c = this.hex;
    const a = this.probeAlpha;
    const engaged = this.activeIndex !== null;
    // A slow breath on the outer ring — the only thing that moves when nothing
    // is happening, so it has to be nearly imperceptible.
    const breathe = this.animating ? Math.sin(this.phase / 420) * 1.4 : 0;
    const ring = (engaged ? 15 : 11) + breathe;

    stroke(g, c["board-live"], 1, a * 0.28);
    circle(g, this.probeX, this.probeY, ring);
    g.stroke();

    if (engaged) {
      stroke(g, c["board-live"], 1, a * 0.16);
      circle(g, this.probeX, this.probeY, ring + 6);
      g.stroke();
    }

    const arm = 5;
    const reach = ring - 2.5;
    stroke(g, c["board-live"], 1.3, a * 0.85);
    g.beginPath();
    g.moveTo(this.probeX - reach, this.probeY);
    g.lineTo(this.probeX - arm, this.probeY);
    g.moveTo(this.probeX + arm, this.probeY);
    g.lineTo(this.probeX + reach, this.probeY);
    g.moveTo(this.probeX, this.probeY - reach);
    g.lineTo(this.probeX, this.probeY - arm);
    g.moveTo(this.probeX, this.probeY + arm);
    g.lineTo(this.probeX, this.probeY + reach);
    g.stroke();

    fill(g, c["board-live"], a);
    circle(g, this.probeX, this.probeY, 1.9);
    g.fill();
  }
}

/* ---------------------------------------------------------------------------
   Small pure helpers, kept out of the class so they stay checkable by eye.
   ------------------------------------------------------------------------ */

function fill(g: Ctx, colour: string, alpha: number): void {
  g.fillStyle = colour;
  g.globalAlpha = alpha;
}

function stroke(g: Ctx, colour: string, width: number, alpha: number): void {
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.globalAlpha = alpha;
}

function circle(g: Ctx, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}

/** `roundRect` by hand: one less thing that depends on a browser version. */
function roundRect(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function polyline(g: Ctx, pts: Point[]): void {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke();
}

function uniqueSegments(paths: Point[][]): Array<[Point, Point]> {
  const seen = new Set<string>();
  const out: Array<[Point, Point]> = [];
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const ka = `${a.x.toFixed(1)},${a.y.toFixed(1)}`;
      const kb = `${b.x.toFixed(1)},${b.y.toFixed(1)}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b]);
    }
  }
  return out;
}

function onPath(path: Point[], v: Point): boolean {
  return path.some((p) => Math.abs(p.x - v.x) < 12 && Math.abs(p.y - v.y) < 12);
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Palette numbers → `#rrggbb`, once per repaint rather than per draw call. */
function toHex(palette: Palette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(palette)) {
    out[k] = `#${v.toString(16).padStart(6, "0")}`;
  }
  return out;
}
