/**
 * The assistant's face: a wireframe sphere that reacts to sound.
 *
 * Hand-written Canvas2D with its own projection, for the same reason the
 * circuit board on the home page is: pulling in three.js would be 600 KB to
 * draw lines, and the interesting part — perspective, depth cueing, additive
 * blending — is thirty lines of maths that are better understood than imported.
 *
 * WHAT DRIVES IT. Two different signals, because the two directions of a
 * conversation expose different things:
 *
 *   listening — a real FFT of the microphone. Each radial shard is bound to a
 *               frequency bin, so the shape genuinely is the spectrum of your
 *               voice and not a decoration timed to look busy.
 *
 *   speaking  — word-boundary events from speechSynthesis. TTS audio never
 *               enters the WebAudio graph (the platform plays it directly), so
 *               there is no spectrum to analyse and pretending otherwise would
 *               be an animation lying about its source. Pulsing on each spoken
 *               word is a real signal about real speech.
 */

export type SphereMode = "idle" | "listening" | "thinking" | "speaking";

/** Radial elements. High enough to read as dense, low enough that a mid-range
 *  laptop holds 60fps while a transformer is also running on the main thread. */
// Density over length. The first attempt used 340 long spikes and read as a
// sea urchin: an explosion, not a sphere. The reference silhouette is a dense
// SHELL — short structures packed on a surface, with the volume carried by
// concentric arcs rather than by radial reach.
const SHARDS = 620;
const RINGS = 22;
const MERIDIANS = 20;
const BANDS = 64;
/** Tangent plates, the flat "city block" faces that catch light on the shell. */
const PLATES = 150;

interface Shard {
  /** Unit position on the sphere. */
  x: number; y: number; z: number;
  /** Which FFT bin drives this one. */
  band: number;
  /** Fixed length variation, so the silhouette is irregular like a city. */
  base: number;
  /** Per-shard phase, so idle breathing does not pulse in unison. */
  phase: number;
  /** A few shards are long spars that reach well past the shell. */
  spar: boolean;
}

/** Fibonacci sphere: even coverage without the pole clustering that naive
 *  lat/long sampling produces, which on a wireframe is very visible. */
function makeShards(): Shard[] {
  const out: Shard[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SHARDS; i++) {
    const y = 1 - (i / (SHARDS - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = golden * i;
    out.push({
      x: Math.cos(t) * r,
      y,
      z: Math.sin(t) * r,
      // Low bins carry most of the energy in speech, so bias toward them
      // rather than spreading linearly across a spectrum that is mostly quiet.
      band: Math.floor(Math.pow(i / SHARDS, 1.7) * BANDS),
      // Short. A shard is a building on the shell, not a ray from the centre;
      // the long ones are rare and deliberate.
      base: 0.015 + ((i * 2654435761) % 1000) / 1000 * 0.075,
      phase: ((i * 40503) % 1000) / 1000 * Math.PI * 2,
      spar: i % 47 === 0,
    });
  }
  return out;
}

export class Sphere {
  private ctx: CanvasRenderingContext2D;
  private shards = makeShards();
  private analyser: AnalyserNode | null = null;
  private freq = new Uint8Array(BANDS);
  private smooth = new Float32Array(BANDS);
  private raf = 0;
  private t = 0;
  private mode: SphereMode = "idle";
  /** Decays to zero after each pulse() — the speaking envelope. */
  private hit = 0;
  private reduced = false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.reduced =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  setMode(mode: SphereMode) {
    this.mode = mode;
    if (mode !== "speaking") this.hit = 0;
  }

  /** Binds the live microphone spectrum. Pass null when the stream ends. */
  attachAnalyser(a: AnalyserNode | null) {
    this.analyser = a;
  }

  /** One spoken word. */
  pulse(strength = 1) {
    this.hit = Math.min(1.4, this.hit + strength);
  }

  start() {
    if (this.raf) return;
    // Reduced motion gets one static frame: the shape is information, the
    // movement is not, so the shape stays and the movement goes.
    if (this.reduced) {
      this.resize();
      this.draw();
      return;
    }
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.t += 1 / 60;
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Sizes the backing store to the element. Capped at 2x: a 3x retina buffer
   *  quadruples fill cost for a wireframe nobody can see the difference on. */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Per-band amplitude in 0..1, from the mic when there is one and from a
   *  slow synthetic envelope when there is not. */
  private sample() {
    if (this.mode === "listening" && this.analyser) {
      const bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(bins);
      // The analyser has more bins than shards need; average into BANDS.
      const per = Math.max(1, Math.floor(bins.length / BANDS));
      for (let b = 0; b < BANDS; b++) {
        let sum = 0;
        for (let i = 0; i < per; i++) sum += bins[b * per + i] ?? 0;
        this.freq[b] = sum / per;
      }
    } else {
      for (let b = 0; b < BANDS; b++) this.freq[b] = 0;
    }

    const speaking = this.mode === "speaking" ? this.hit : 0;
    const busy = this.mode === "thinking" ? 0.5 : 0;
    for (let b = 0; b < BANDS; b++) {
      // Idle breathing, offset per band so the shell undulates rather than
      // inflating as one ball.
      const idle = 0.12 + 0.08 * Math.sin(this.t * 0.9 + b * 0.35);
      const target = Math.max(
        this.freq[b] / 255,
        idle,
        speaking * (0.5 + 0.5 * Math.sin(b * 0.7 + this.t * 6)),
        busy * (0.35 + 0.3 * Math.sin(b * 1.3 + this.t * 9)),
      );
      // Asymmetric smoothing: rise fast so a consonant registers, fall slowly
      // so the shape does not strobe.
      const k = target > this.smooth[b] ? 0.45 : 0.08;
      this.smooth[b] += (target - this.smooth[b]) * k;
    }
    this.hit *= 0.90;
  }

  private draw() {
    this.resize();
    this.sample();

    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.34;

    ctx.clearRect(0, 0, w, h);
    // Additive blending is what makes overlapping strokes bloom into a core
    // instead of muddying, which is the whole look.
    ctx.globalCompositeOperation = "lighter";

    const spin = this.reduced ? 0.6 : this.t * 0.18;
    const tilt = 0.42 + (this.reduced ? 0 : Math.sin(this.t * 0.12) * 0.06);
    const cosA = Math.cos(spin), sinA = Math.sin(spin);
    const cosB = Math.cos(tilt), sinB = Math.sin(tilt);

    /** Rotate about Y then X, then project with a simple perspective divide. */
    const project = (x: number, y: number, z: number) => {
      const x1 = x * cosA - z * sinA;
      const z1 = x * sinA + z * cosA;
      const y2 = y * cosB - z1 * sinB;
      const z2 = y * sinB + z1 * cosB;
      const d = 3.2 / (3.2 - z2);          // camera at z = 3.2 radii
      return { sx: cx + x1 * R * d, sy: cy + y2 * R * d, z: z2, d };
    };

    // ---- the shell: latitude rings and meridians --------------------------
    // Drawn segment by segment rather than as one path, so each piece can be
    // dimmed by its own depth. A single stroked path would be uniformly bright
    // and the sphere would collapse into a flat disc of circles.
    const arc = (
      pts: Array<{ sx: number; sy: number; z: number }>,
      base: number,
      amp: number,
    ) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const depth = ((a.z + b.z) / 2 + 1) / 2;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = `rgba(255, ${170 + Math.floor(depth * 60)}, ${50 + Math.floor(amp * 90)}, ${
          (base + amp * 0.35) * (0.15 + depth * 0.85)
        })`;
        ctx.lineWidth = 0.5 + depth * 0.9;
        ctx.stroke();
      }
    };

    for (let r = 1; r < RINGS - 1; r++) {
      const lat = (r / (RINGS - 1)) * Math.PI - Math.PI / 2;
      const amp = this.smooth[Math.floor((r / RINGS) * BANDS)];
      const rr = 1 + amp * 0.06;
      const pts = [];
      for (let k = 0; k <= 84; k++) {
        const lon = (k / 84) * Math.PI * 2;
        // Deterministic per-segment jitter. A perfect grid reads as a globe
        // diagram; the reference reads as structure because nothing on it is
        // exactly round.
        const j = rr * (1 + Math.sin(k * 2.7 + r * 5.1) * 0.018);
        pts.push(project(
          Math.cos(lat) * Math.cos(lon) * j,
          Math.sin(lat) * j,
          Math.cos(lat) * Math.sin(lon) * j,
        ));
      }
      arc(pts, 0.16, amp);
    }

    for (let m = 0; m < MERIDIANS; m++) {
      const lon = (m / MERIDIANS) * Math.PI * 2;
      const amp = this.smooth[Math.floor((m / MERIDIANS) * BANDS)];
      const rr = 1 + amp * 0.06;
      const pts = [];
      for (let k = 0; k <= 48; k++) {
        const lat = (k / 48) * Math.PI - Math.PI / 2;
        pts.push(project(
          Math.cos(lat) * Math.cos(lon) * rr,
          Math.sin(lat) * rr,
          Math.cos(lat) * Math.sin(lon) * rr,
        ));
      }
      arc(pts, 0.10, amp);
    }

    // ---- gyroscopic arcs --------------------------------------------------
    // Three bright rings on tilted planes, counter-rotating. In the reference
    // these are the brightest feature and the reason it reads as an instrument
    // rather than a globe.
    for (let g = 0; g < 3; g++) {
      const amp = this.smooth[g * 9];
      const rad = 0.55 + g * 0.2 + amp * 0.1;
      const roll = this.t * (0.5 - g * 0.35) + g * 2.1;
      const cosR = Math.cos(roll), sinR = Math.sin(roll);
      const lean = 0.7 + g * 0.5;
      const cosL = Math.cos(lean), sinL = Math.sin(lean);
      const pts = [];
      for (let k = 0; k <= 96; k++) {
        const a2 = (k / 96) * Math.PI * 2;
        // A unit circle in XY, leaned about X, then rolled about Y.
        const px = Math.cos(a2) * rad;
        const py0 = Math.sin(a2) * rad;
        const py = py0 * cosL;
        const pz0 = py0 * sinL;
        pts.push(project(px * cosR - pz0 * sinR, py, px * sinR + pz0 * cosR));
      }
      arc(pts, 0.42, amp * 1.2);
    }

    // ---- tangent plates ---------------------------------------------------
    // Small quads lying flat against the shell. These are what stop the
    // surface reading as pure wireframe and give it the built, panelled look.
    for (let i = 0; i < PLATES; i++) {
      const sh = this.shards[(i * 7) % this.shards.length];
      const amp = this.smooth[sh.band];
      const depth = (sh.z + 1) / 2;
      if (depth < 0.35) continue;   // back faces would only add haze

      // An orthonormal frame on the surface, from an arbitrary up vector.
      const ux = -sh.z, uy = 0, uz = sh.x;
      const ul = Math.hypot(ux, uy, uz) || 1;
      const ax = ux / ul, ay = uy / ul, az = uz / ul;
      const bx = sh.y * az - sh.z * ay;
      const by = sh.z * ax - sh.x * az;
      const bz = sh.x * ay - sh.y * ax;

      const w = 0.035 + amp * 0.05;
      const h = 0.02 + ((i * 2654435761) % 100) / 100 * 0.05;
      const r0 = 1 + sh.base * 0.5;
      ctx.beginPath();
      for (let c = 0; c < 4; c++) {
        const su = c === 0 || c === 3 ? -w : w;
        const sv = c < 2 ? -h : h;
        const p = project(
          (sh.x + ax * su + bx * sv) * r0,
          (sh.y + ay * su + by * sv) * r0,
          (sh.z + az * su + bz * sv) * r0,
        );
        if (c === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255, 205, 110, ${(0.10 + amp * 0.5) * depth})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 170, 40, ${(0.03 + amp * 0.16) * depth})`;
      ctx.fill();
    }

    // ---- radial shards ----------------------------------------------------
    for (const s of this.shards) {
      const amp = this.smooth[s.band];
      const breathe = 1 + Math.sin(this.t * 1.4 + s.phase) * 0.02;
      const len = (s.base + amp * (s.spar ? 0.55 : 0.09)) * breathe;

      const a = project(s.x, s.y, s.z);
      const b = project(s.x * (1 + len), s.y * (1 + len), s.z * (1 + len));

      // Depth cueing: the far hemisphere is dimmer and thinner. Without this
      // the sphere reads as a flat disc of noise.
      const depth = (s.z + 1) / 2;
      const alpha = (0.12 + depth * 0.55) * (0.45 + amp * 1.5);
      // Hotter core, cooler rim — the gradient the reference gets from bloom.
      const g = 150 + Math.floor(depth * 90 + amp * 60);
      ctx.strokeStyle = `rgba(255, ${Math.min(240, g)}, ${Math.floor(40 + amp * 120)}, ${Math.min(1, alpha)})`;
      ctx.lineWidth = (s.spar ? 1.6 : 0.9) * (0.5 + depth);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();

      // A tick at the tip. Cheap, and it gives the silhouette the studded
      // texture that makes it look built rather than drawn.
      if (depth > 0.45) {
        ctx.fillStyle = `rgba(255, 230, 170, ${alpha * 0.8})`;
        ctx.fillRect(b.sx - 0.9, b.sy - 0.9, 1.8, 1.8);
      }
    }

    // ---- core -------------------------------------------------------------
    const energy = this.smooth.reduce((n, v) => n + v, 0) / BANDS;
    const cr = R * (0.34 + energy * 0.5);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    core.addColorStop(0, `rgba(255, 244, 214, ${0.42 + energy * 0.45})`);
    core.addColorStop(0.28, `rgba(255, 186, 70, ${0.16 + energy * 0.24})`);
    core.addColorStop(1, "rgba(255, 140, 0, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
  }
}
