/**
 * Everything /lab/search measures, with no React in it.
 *
 * The page's whole claim is that the index can be CHECKED rather than believed,
 * so the checking lives in one plain module: parse the shipped vector payload,
 * synthesise query points, sweep `ef`, count what the graph touched, and
 * compare it against a brute-force scan of the same vectors. A component then
 * renders numbers it did not compute.
 *
 * NOTHING HERE MAY BE IMPORTED SYNCHRONOUSLY BY A SERVER COMPONENT. The wasm
 * glue is reached through `import()` inside `loadWasm`, and the page reaches
 * this file only through `next/dynamic`, so none of it can land in the
 * first-paint bundle (`npm run check:bundle` enforces that).
 *
 * The deliberate design point: none of the measurements below need the ~22 MB
 * embedding model. Document vectors are prebuilt and shipped, so a query point
 * can be MADE from them — see `blendedQueries` — and recall against ground
 * truth is computable the moment 38 KB of vectors has arrived.
 */

import type { Chunk } from "./types";

// ---------------------------------------------------------------------------
// The wasm surface
//
// hnsw-glue.js is generated JS with JSDoc but no .d.ts, so the shape it exports
// is declared here once. Written to match crates/hnsw/src/lib.rs exactly; if
// the Rust API changes, this is the file that should stop compiling.
// ---------------------------------------------------------------------------

export interface HnswIndex {
  /** `[id0, sim0, id1, sim1, …]`, best first. Similarity, not distance. */
  search(query: Float32Array, k: number, efSearch: number): Float32Array;
  /** Exhaustive scan over the same vectors — the ground truth. */
  brute_force(query: Float32Array, k: number): Float32Array;

  readonly len: number;
  readonly dim: number;
  readonly m: number;
  readonly efConstruction: number;
  readonly maxLevel: number;
  readonly entryPoint: number | undefined;

  layerSizes(): Uint32Array;
  layerEdges(layer: number): Uint32Array;
  layerMembers(layer: number): Uint32Array;
  layerDegrees(layer: number): Uint32Array;

  readonly lastHops: number;
  readonly lastDistanceComputations: number;
  /** Flat `[layer, node, layer, node, …]`, top layer first. */
  lastPath(): Uint32Array;

  free(): void;
}

interface HnswModule {
  default: (opts: { module_or_path: string | ArrayBuffer }) => Promise<unknown>;
  Index: new (bytes: Uint8Array) => HnswIndex;
}

let modulePromise: Promise<HnswModule> | null = null;

/** Loads + initialises the wasm module once per tab. */
export function loadWasm(base = "/search"): Promise<HnswModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = (await import("./hnsw-glue.js")) as unknown as HnswModule;
      await mod.default({ module_or_path: `${base}/hnsw_bg.wasm` });
      return mod;
    })();
  }
  return modulePromise;
}

// ---------------------------------------------------------------------------
// The vector payload
//
// A JS reader for the format documented in crates/hnsw/src/quant.rs. It exists
// because the page needs the vectors on THIS side of the boundary too: query
// points are built from them, and the 2-D projection is computed from them.
// Kept deliberately close to `Quantized::row_into` — same dequantisation, same
// lack of re-normalisation — so a query made here is the same arithmetic the
// index did on the way in.
// ---------------------------------------------------------------------------

export const VECTORS_MAGIC = 0x3151_5654; // "TVQ1"
const HEADER_BYTES = 16;

export interface VectorSet {
  readonly bytes: ArrayBuffer;
  readonly count: number;
  readonly dim: number;
  /** Dequantised row `i`. A fresh array each call — these get handed to wasm. */
  row(i: number): Float32Array;
}

export function parseVectors(bytes: ArrayBuffer): VectorSet {
  if (bytes.byteLength < HEADER_BYTES) throw new Error("vector payload is shorter than its header");
  const view = new DataView(bytes);
  const magic = view.getUint32(0, true);
  if (magic !== VECTORS_MAGIC) {
    throw new Error(`bad magic 0x${magic.toString(16)} — is this vectors.bin?`);
  }
  const count = view.getUint32(4, true);
  const dim = view.getUint32(8, true);
  const expected = HEADER_BYTES + count * 4 + count * dim;
  if (bytes.byteLength !== expected) {
    throw new Error(`vector payload is ${bytes.byteLength} bytes, header describes ${expected}`);
  }

  const scales = new Float32Array(bytes, HEADER_BYTES, count);
  const codes = new Int8Array(bytes, HEADER_BYTES + count * 4, count * dim);

  return {
    bytes,
    count,
    dim,
    row(i: number) {
      const out = new Float32Array(dim);
      const scale = scales[i];
      const start = i * dim;
      for (let j = 0; j < dim; j++) out[j] = codes[start + j] * scale;
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic randomness
//
// Every query set on this page is seeded. A recall number sampled from a fresh
// random draw on every page load is an anecdote; the same number from the same
// seed is something a visitor can hold me to.
// ---------------------------------------------------------------------------

export function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

function normalise(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  if (n <= 0) return v;
  const inv = 1 / Math.sqrt(n);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

/**
 * Query points that are NOT in the index, built without the embedding model.
 *
 * Each query is the normalised midpoint of two chunk vectors. Using a chunk
 * vector directly would be a self-query, and a self-query is the easiest
 * question you can ask an index — the answer is a node the walk starts next
 * to. A midpoint sits between two documents, is not any row of the payload,
 * and forces the graph to navigate. Ground truth for it is still exact,
 * because `brute_force` scans the same vectors.
 */
export function blendedQueries(vs: VectorSet, seed = 0x5eed1d0c): Float32Array[] {
  const rnd = splitmix32(seed);
  const out: Float32Array[] = [];
  for (let i = 0; i < vs.count; i++) {
    let j = Math.floor(rnd() * vs.count);
    if (j === i) j = (i + 1) % vs.count;
    const a = vs.row(i);
    const b = vs.row(j);
    const q = new Float32Array(vs.dim);
    for (let d = 0; d < vs.dim; d++) q[d] = a[d] * 0.5 + b[d] * 0.5;
    out.push(normalise(q));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

export interface SweepRow {
  ef: number;
  /** Fraction of the true k nearest neighbours the graph returned, 0..1. */
  recall: number;
  /** Mean distance evaluations per query. Compare against `n`. */
  distances: number;
  /** Mean nodes popped from the candidate queue per query. */
  hops: number;
  /** Mean microseconds per query, timed as a batch — see `timeBatch`. */
  micros: number;
}

function idsOf(flat: Float32Array): number[] {
  const ids: number[] = [];
  for (let i = 0; i < flat.length; i += 2) ids.push(flat[i]);
  return ids;
}

/** The k true nearest neighbours of each query, by exhaustive scan. */
export function groundTruth(index: HnswIndex, queries: Float32Array[], k: number): Set<number>[] {
  return queries.map((q) => new Set(idsOf(index.brute_force(q, k))));
}

/**
 * Times `runs` passes over the whole query set and returns microseconds per
 * query.
 *
 * Timed as a batch on purpose. `performance.now()` is clamped to 5 µs in a
 * browser that is not cross-origin isolated, and one query here costs less
 * than that — timing a single call would report the clamp, not the query.
 */
function timeBatch(queries: Float32Array[], runs: number, fn: (q: Float32Array) => void): number {
  // One untimed pass so the measurement is not paying for the first-call
  // tier-up of the wasm function it is about to time.
  for (const q of queries) fn(q);
  const t0 = performance.now();
  for (let r = 0; r < runs; r++) for (const q of queries) fn(q);
  const elapsed = performance.now() - t0;
  return (elapsed * 1000) / (runs * queries.length);
}

export function measureEf(
  index: HnswIndex,
  queries: Float32Array[],
  truth: Set<number>[],
  k: number,
  ef: number,
  runs = 5,
): SweepRow {
  let found = 0;
  let total = 0;
  let distances = 0;
  let hops = 0;

  for (let i = 0; i < queries.length; i++) {
    const got = new Set(idsOf(index.search(queries[i], k, ef)));
    distances += index.lastDistanceComputations;
    hops += index.lastHops;
    total += truth[i].size;
    for (const id of truth[i]) if (got.has(id)) found++;
  }

  const micros = timeBatch(queries, runs, (q) => index.search(q, k, ef));
  const n = queries.length;
  return {
    ef,
    recall: total === 0 ? 0 : found / total,
    distances: distances / n,
    hops: hops / n,
    micros,
  };
}

/** The same batch timing for the exhaustive scan, so the two are comparable. */
export function measureBruteForce(index: HnswIndex, queries: Float32Array[], k: number, runs = 5) {
  return timeBatch(queries, runs, (q) => index.brute_force(q, k));
}

/** The `ef` ladder the page sweeps. Starts at k: the crate clamps ef up to k,
 *  so anything below it is the same search under a different label. */
export const EF_LADDER = [10, 12, 16, 24, 32, 48, 64, 96, 128, 200] as const;

// ---------------------------------------------------------------------------
// Graph shape
// ---------------------------------------------------------------------------

export interface LayerStats {
  layer: number;
  nodes: number;
  /** Undirected pairs `a < b` as the crate reports them. */
  edges: number;
  minDegree: number;
  maxDegree: number;
  meanDegree: number;
  /** Degree histogram, one bucket per distinct degree present. */
  histogram: Array<{ degree: number; count: number }>;
}

export function layerStats(index: HnswIndex): LayerStats[] {
  const sizes = Array.from(index.layerSizes());
  return sizes.map((nodes, layer) => {
    const degrees = Array.from(index.layerDegrees(layer));
    const counts = new Map<number, number>();
    let sum = 0;
    for (const d of degrees) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
      sum += d;
    }
    return {
      layer,
      nodes,
      edges: index.layerEdges(layer).length / 2,
      minDegree: degrees.length ? Math.min(...degrees) : 0,
      maxDegree: degrees.length ? Math.max(...degrees) : 0,
      meanDegree: degrees.length ? sum / degrees.length : 0,
      histogram: [...counts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([degree, count]) => ({ degree, count })),
    };
  });
}

/** `[a, b]` pairs for one layer. */
export function layerEdgePairs(index: HnswIndex, layer: number): Array<[number, number]> {
  const flat = index.layerEdges(layer);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/**
 * Two-component PCA of the corpus — the layout for the map, and the number that
 * keeps it honest.
 *
 * Power iteration with one deflation. n is ~100 and d is 384, so this is a few
 * milliseconds and needs no library. What matters more than the coordinates is
 * `explained`: the fraction of the corpus's variance these two axes carry.
 * Everything else is variance the picture cannot show, and the caption says so
 * with this number in it rather than a hand-wave.
 */
export interface Projection {
  xs: Float32Array;
  ys: Float32Array;
  /** Fraction of total variance on the two drawn axes, 0..1. */
  explained: number;
}

export function project2D(vs: VectorSet, iterations = 64): Projection {
  const { count: n, dim: d } = vs;
  const rows: Float32Array[] = [];
  const mean = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    const r = vs.row(i);
    rows.push(r);
    for (let j = 0; j < d; j++) mean[j] += r[j];
  }
  for (let j = 0; j < d; j++) mean[j] /= n;

  let totalVar = 0;
  for (const r of rows) {
    for (let j = 0; j < d; j++) {
      r[j] -= mean[j];
      totalVar += r[j] * r[j];
    }
  }
  totalVar /= n;

  const rnd = splitmix32(7);
  const component = (deflate: Float64Array | null): { axis: Float64Array; variance: number } => {
    const v = new Float64Array(d);
    for (let j = 0; j < d; j++) v[j] = rnd() - 0.5;
    let variance = 0;
    for (let it = 0; it < iterations; it++) {
      if (deflate) orthogonalise(v, deflate);
      const next = new Float64Array(d);
      // next = Xᵀ X v, accumulated row by row so the d×d covariance matrix is
      // never materialised (384² floats for no reason).
      for (const r of rows) {
        let dot = 0;
        for (let j = 0; j < d; j++) dot += r[j] * v[j];
        for (let j = 0; j < d; j++) next[j] += r[j] * dot;
      }
      let norm = 0;
      for (let j = 0; j < d; j++) norm += next[j] * next[j];
      norm = Math.sqrt(norm);
      if (norm === 0) break;
      variance = norm / n;
      for (let j = 0; j < d; j++) v[j] = next[j] / norm;
    }
    if (deflate) orthogonalise(v, deflate);
    return { axis: v, variance };
  };

  const first = component(null);
  const second = component(first.axis);

  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    const r = rows[i];
    for (let j = 0; j < d; j++) {
      x += r[j] * first.axis[j];
      y += r[j] * second.axis[j];
    }
    xs[i] = x;
    ys[i] = y;
  }

  return {
    xs,
    ys,
    explained: totalVar > 0 ? (first.variance + second.variance) / totalVar : 0,
  };
}

function orthogonalise(v: Float64Array, against: Float64Array) {
  let dot = 0;
  for (let j = 0; j < v.length; j++) dot += v[j] * against[j];
  let norm = 0;
  for (let j = 0; j < v.length; j++) {
    v[j] -= dot * against[j];
    norm += v[j] * v[j];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let j = 0; j < v.length; j++) v[j] /= norm;
}

// ---------------------------------------------------------------------------
// The page's own index
//
// Deliberately NOT the one inside SearchEngine. The palette's index is built
// behind the 22 MB model opt-in and is exposed through a narrow `search`
// surface; this page needs the introspection API, needs it without the model,
// and needs to own the telemetry it reads back. Same wasm module, same
// payload, separate instance.
// ---------------------------------------------------------------------------

export interface LabIndex {
  index: HnswIndex;
  vectors: VectorSet;
  chunks: Chunk[];
  /** Milliseconds spent inside `Index::build` — graph construction only. */
  buildMs: number;
  /** Milliseconds from first byte requested to payload in hand. */
  fetchMs: number;
  /** Bytes actually fetched for the index itself (wasm is counted separately). */
  payloadBytes: number;
}

let labIndexPromise: Promise<LabIndex> | null = null;

export function loadLabIndex(base = "/search"): Promise<LabIndex> {
  if (!labIndexPromise) {
    labIndexPromise = (async () => {
      const t0 = performance.now();
      const [mod, payload, chunks] = await Promise.all([
        loadWasm(base),
        fetch(`${base}/vectors.bin`).then((r) => r.arrayBuffer()),
        fetch(`${base}/chunks.json`).then((r) => r.json() as Promise<Chunk[]>),
      ]);
      const fetchMs = performance.now() - t0;

      const t1 = performance.now();
      const index = new mod.Index(new Uint8Array(payload));
      const buildMs = performance.now() - t1;

      return {
        index,
        vectors: parseVectors(payload),
        chunks,
        buildMs,
        fetchMs,
        payloadBytes: payload.byteLength,
      };
    })();
  }
  return labIndexPromise;
}

// ---------------------------------------------------------------------------
// One query, fully instrumented
// ---------------------------------------------------------------------------

export interface QueryRun {
  /** What was asked, in the visitor's terms. */
  label: string;
  source: "chunk" | "text";
  k: number;
  ef: number;
  hits: Array<{ id: number; score: number }>;
  /** Ids the exhaustive scan returns for the same query, in the same order. */
  exact: number[];
  hops: number;
  distances: number;
  micros: number;
  /** Where each layer's descent landed, top layer first. */
  path: Array<{ layer: number; node: number }>;
}

export function runQuery(
  index: HnswIndex,
  vector: Float32Array,
  k: number,
  ef: number,
  label: string,
  source: "chunk" | "text",
  runs = 40,
): QueryRun {
  const flat = index.search(vector, k, ef);
  const hits: Array<{ id: number; score: number }> = [];
  for (let i = 0; i < flat.length; i += 2) hits.push({ id: flat[i], score: flat[i + 1] });

  const hops = index.lastHops;
  const distances = index.lastDistanceComputations;
  const rawPath = index.lastPath();
  const path: Array<{ layer: number; node: number }> = [];
  for (let i = 0; i < rawPath.length; i += 2) path.push({ layer: rawPath[i], node: rawPath[i + 1] });

  const exact = idsOf(index.brute_force(vector, k));
  const micros = timeBatch([vector], runs, (q) => index.search(q, k, ef));

  return { label, source, k, ef, hits, exact, hops, distances, micros, path };
}
