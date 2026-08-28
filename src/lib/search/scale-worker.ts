/**
 * The 100× scale test, off the main thread.
 *
 * Building an HNSW graph over 10,000 vectors is one uninterruptible call into
 * wasm that takes several seconds. On the main thread that is a frozen tab,
 * and a frozen tab on a page whose entire argument is "measure it yourself"
 * reads as a page that crashed. So it runs here, and the UI stays live and
 * reports progress while it happens.
 *
 * The worker owns its own wasm instance and its own index. It never touches the
 * shipped 99-chunk index — that one stays on the main thread where the query
 * box needs it synchronously.
 */

import {
  EF_LADDER,
  groundTruth,
  loadWasm,
  measureBruteForce,
  measureEf,
  splitmix32,
  type HnswIndex,
  type SweepRow,
} from "./stats";
import { makeSyntheticCorpus } from "./synthetic";

export interface ScaleRequest {
  count: number;
  dim: number;
  k: number;
  queries: number;
}

export type ScaleMessage =
  | { type: "phase"; phase: "generating" | "building" | "measuring" }
  | { type: "built"; buildMs: number; layerSizes: number[]; count: number; dim: number }
  | { type: "row"; row: SweepRow }
  | { type: "done"; bruteMicros: number }
  | { type: "error"; message: string };

function post(message: ScaleMessage) {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = async (event: MessageEvent<ScaleRequest>) => {
  const { count, dim, k, queries } = event.data;
  let index: HnswIndex | null = null;
  try {
    post({ type: "phase", phase: "generating" });
    const corpus = makeSyntheticCorpus(count, dim);

    post({ type: "phase", phase: "building" });
    const { Index } = await loadWasm();
    const t0 = performance.now();
    index = new Index(new Uint8Array(corpus.payload));
    const buildMs = performance.now() - t0;
    post({
      type: "built",
      buildMs,
      layerSizes: Array.from(index.layerSizes()),
      count: index.len,
      dim: index.dim,
    });

    post({ type: "phase", phase: "measuring" });
    // Same query construction as the small index: midpoints of two corpus
    // rows, so neither test is asking a question it already holds the answer
    // to, and the two recall curves are comparable.
    const rnd = splitmix32(0x1d0c5eed);
    const qs: Float32Array[] = [];
    for (let i = 0; i < queries; i++) {
      const a = corpus.row(Math.floor(rnd() * count));
      const b = corpus.row(Math.floor(rnd() * count));
      const q = new Float32Array(dim);
      let norm = 0;
      for (let j = 0; j < dim; j++) {
        q[j] = a[j] * 0.5 + b[j] * 0.5;
        norm += q[j] * q[j];
      }
      const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
      for (let j = 0; j < dim; j++) q[j] *= inv;
      qs.push(q);
    }

    const truth = groundTruth(index, qs, k);
    for (const ef of EF_LADDER) {
      post({ type: "row", row: measureEf(index, qs, truth, k, ef, 2) });
    }
    post({ type: "done", bruteMicros: measureBruteForce(index, qs, k, 2) });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    index?.free();
  }
};
