/**
 * A synthetic corpus in the shipped vector format.
 *
 * WHY THIS EXISTS. /lab/search's honest finding is that at 99 chunks the graph
 * does not save work, a full scan is already 99 distance evaluations, and the
 * walk costs about the same. The claim that HNSW earns its place at scale is
 * therefore not demonstrable on this site's own corpus, and quoting somebody
 * else's benchmark for it would be exactly the kind of assertion this page
 * exists not to make.
 *
 * So the page builds a second index, in the visitor's browser, from vectors it
 * generates: 100× the rows, the same 384 dimensions, the same `Index::build`,
 * the same `search` and `brute_force`. The vectors are synthetic and the page
 * says so, what is being measured is the graph's behaviour as n grows, and
 * that is a property of the algorithm, not of the text.
 *
 * The payload is a real `vectors.bin` (see crates/hnsw/src/quant.rs), byte for
 * byte, so it goes through the same parser and the same dequantiser as the
 * shipped one. Nothing about the scale test is a special path through the Rust.
 */

import { splitmix32, VECTORS_MAGIC } from "./stats";

const HEADER_BYTES = 16;

export interface SyntheticCorpus {
  /** A valid `vectors.bin` payload, ready for `new Index(bytes)`. */
  payload: ArrayBuffer;
  count: number;
  dim: number;
  /** Dequantised row `i`, identical arithmetic to what the index stored. */
  row(i: number): Float32Array;
}

/**
 * `count` vectors in `dim` dimensions, drawn from `clusters` gaussian blobs.
 *
 * Clustered rather than uniform on purpose. Uniform-random points in 384
 * dimensions are all very nearly equidistant from each other, which makes any
 * nearest-neighbour index look excellent for a reason that has nothing to do
 * with the index: there is no structure to lose. Real embeddings are clumpy,
 * so the test corpus is clumpy, and the recall number means something.
 */
export function makeSyntheticCorpus(
  count: number,
  dim: number,
  clusters = 48,
  seed = 0x5eed1d0c,
): SyntheticCorpus {
  const rnd = splitmix32(seed);
  const gauss = () => {
    const u1 = Math.max(rnd(), 1e-9);
    const u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const centres: Float32Array[] = [];
  for (let c = 0; c < clusters; c++) {
    const v = new Float32Array(dim);
    for (let j = 0; j < dim; j++) v[j] = gauss();
    centres.push(v);
  }

  const payload = new ArrayBuffer(HEADER_BYTES + count * 4 + count * dim);
  const view = new DataView(payload);
  view.setUint32(0, VECTORS_MAGIC, true);
  view.setUint32(4, count, true);
  view.setUint32(8, dim, true);
  view.setUint32(12, 0, true);

  const scales = new Float32Array(payload, HEADER_BYTES, count);
  const codes = new Int8Array(payload, HEADER_BYTES + count * 4, count * dim);
  const raw = new Float32Array(dim);

  for (let i = 0; i < count; i++) {
    const centre = centres[i % clusters];
    let norm = 0;
    for (let j = 0; j < dim; j++) {
      const v = centre[j] * 0.85 + gauss() * 0.55;
      raw[j] = v;
      norm += v * v;
    }
    // L2-normalised before quantising, exactly like the real payload: the
    // per-vector int8 scale is only well-behaved on a bounded, tight
    // distribution, and the unit sphere is what gives it one.
    const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
    let peak = 0;
    for (let j = 0; j < dim; j++) {
      raw[j] *= inv;
      const a = Math.abs(raw[j]);
      if (a > peak) peak = a;
    }
    const scale = peak > 0 ? peak / 127 : 1e-6;
    scales[i] = scale;
    const start = i * dim;
    for (let j = 0; j < dim; j++) {
      codes[start + j] = Math.max(-127, Math.min(127, Math.round(raw[j] / scale)));
    }
  }

  return {
    payload,
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
