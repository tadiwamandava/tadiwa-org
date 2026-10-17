import type { Chunk, Hit, LexicalIndex, SemanticState } from "./types";
import { bm25, dedupeByUrl } from "./lexical";

/**
 * Two-stage search.
 *
 *   Stage 1, lexical. ~80 KB of JSON, loaded on first open, BM25 in the main
 *             thread. Answers the first keystroke. This is what almost every
 *             visitor will ever use.
 *
 *   Stage 2, semantic. An HNSW graph I wrote in Rust (compiled to WASM,
 *             ~18 KB gzip) over int8 document vectors, plus a quantised
 *             MiniLM to embed the query. The model is ~22 MB, so it is
 *             EXPLICITLY OPT-IN and the size is shown before the click. A
 *             portfolio that silently pulls 22 MB because someone pressed ⌘K
 *             is a portfolio that has misunderstood the assignment.
 *
 * Everything here is dynamically imported. None of it may enter the first-paint
 * bundle, `npm run check:bundle` fails the build if it does.
 */

const BASE = "/search";

/**
 * The query embedder, on its own.
 *
 * Exported because /lab/search needs the same model under different
 * circumstances: there, free-text search is an opt-in extra bolted onto an
 * index that is already loaded and already being measured, so it needs the
 * embedder without the rest of `loadSemantic`'s state machine. Extracted rather
 * than copied, the two `env` flags below are the kind of detail that drifts
 * silently when it exists twice.
 *
 * ~22 MB. Never call this without telling the visitor first.
 */
export async function loadEmbedder(): Promise<(text: string) => Promise<Float32Array>> {
  const { pipeline, env } = await import("@huggingface/transformers");
  // Same-origin only: the weights are served from this deployment, not
  // from a third-party CDN.
  //
  // BOTH flags are required. In the browser build `allowLocalModels`
  // defaults to FALSE, so setting only `allowRemoteModels = false` turns
  // every source off and transformers.js refuses to start with
  // "both local and remote models are disabled".
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = "/models/";
  const extractor = await pipeline("feature-extraction", "all-MiniLM-L6-v2", {
    dtype: "q8",
  });
  return async (text: string) => {
    const out = await extractor(text, { pooling: "mean", normalize: true });
    return Float32Array.from(out.data as Float32Array);
  };
}

type Listener = () => void;

class SearchEngine {
  private chunks: Chunk[] = [];
  private lexIndex: LexicalIndex | null = null;
  private lexPromise: Promise<void> | null = null;

  private wasmIndex: { search(q: Float32Array, k: number, ef: number): Float32Array } | null = null;
  private embed: ((t: string) => Promise<Float32Array>) | null = null;
  private semanticPromise: Promise<void> | null = null;

  semantic: SemanticState = { status: "idle" };
  /** Bumped on every state change. Lets a component subscribe to "anything
   *  happened" without the engine having to model every field as a store. */
  revision = 0;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  private setSemantic(s: SemanticState) {
    this.semantic = s;
    this.emit();
  }

  get lexicalReady() {
    return this.lexIndex !== null;
  }
  get semanticReady() {
    return this.wasmIndex !== null && this.embed !== null;
  }

  /** Stage 1. Idempotent; safe to call on every palette open. */
  async loadLexical(): Promise<void> {
    if (this.lexIndex) return;
    if (!this.lexPromise) {
      this.lexPromise = (async () => {
        const [chunks, lex] = await Promise.all([
          fetch(`${BASE}/chunks.json`).then((r) => {
            if (!r.ok) throw new Error(`Search passages could not load (${r.status}).`);
            return r.json() as Promise<Chunk[]>;
          }),
          fetch(`${BASE}/lexical.json`).then((r) => {
            if (!r.ok) throw new Error(`Search index could not load (${r.status}).`);
            return r.json() as Promise<LexicalIndex>;
          }),
        ]);
        this.chunks = chunks;
        this.lexIndex = lex;
        this.emit();
      })().catch((err: unknown) => {
        this.lexPromise = null;
        throw err;
      });
    }
    return this.lexPromise;
  }

  /** Stage 2. Only ever called from an explicit user action. */
  async loadSemantic(): Promise<void> {
    if (this.semanticReady) return;
    if (this.semanticPromise) return this.semanticPromise;

    this.semanticPromise = (async () => {
      const started = performance.now();
      try {
        await this.loadLexical();

        this.setSemantic({ status: "loading", note: "vector index" });
        const [{ default: init, Index }, payload] = await Promise.all([
          import("./hnsw-glue.js") as Promise<{
            default: (a: { module_or_path: string }) => Promise<unknown>;
            Index: new (bytes: Uint8Array) => {
              search(q: Float32Array, k: number, ef: number): Float32Array;
            };
          }>,
          fetch(`${BASE}/vectors.bin`).then((r) => r.arrayBuffer()),
        ]);
        await init({ module_or_path: `${BASE}/hnsw_bg.wasm` });
        this.wasmIndex = new Index(new Uint8Array(payload));

        this.setSemantic({ status: "loading", note: "embedding model (~22 MB)" });
        this.embed = await loadEmbedder();

        this.setSemantic({
          status: "ready",
          buildMs: Math.round(performance.now() - started),
          chunks: this.chunks.length,
        });
      } catch (err) {
        this.wasmIndex = null;
        this.embed = null;
        this.semanticPromise = null;
        this.setSemantic({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return this.semanticPromise;
  }

  /** Instant, synchronous, never blocks on the model. */
  searchLexical(query: string, limit = 8): Hit[] {
    if (!this.lexIndex) return [];
    return dedupeByUrl(bm25(query, this.lexIndex, this.chunks, limit * 4), limit);
  }

  /**
   * Retrieval for grounding, which wants PASSAGES where search wants pages.
   *
   * `dedupeByUrl` exists so the palette does not show one project five times.
   * A grounded answer wants exactly the opposite: the pitch AND the hardest
   * thing from the same writeup are two different facts, and collapsing them
   * throws away the second one. Same index, same scorer, different tail.
   *
   * Returns [] when no query term appears in the corpus at all, which is the
   * signal the caller needs to refuse without spending a forward pass.
   */
  searchPassages(query: string, limit = 4): Hit[] {
    if (!this.lexIndex) return [];
    return bm25(query, this.lexIndex, this.chunks, limit);
  }

  /** searchPassages, re-ranked by the vector index when it is loaded. */
  async searchPassagesSemantic(query: string, limit = 4, ef = 64): Promise<Hit[]> {
    if (!this.wasmIndex || !this.embed) return this.searchPassages(query, limit);
    const vec = await this.embed(query);
    const flat = this.wasmIndex.search(vec, limit, ef);
    const hits: Hit[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      const chunk = this.chunks[flat[i]];
      if (chunk) hits.push({ chunk, score: flat[i + 1] });
    }
    return hits;
  }

  /** Every chunk belonging to one page, in corpus order. Used by grounding to
   *  pull a passage that ranking missed but the question needs. */
  passagesForUrl(url: string): Chunk[] {
    return this.chunks.filter((c) => c.url === url);
  }

  /** Only meaningful once `semanticReady`. Falls back rather than throwing. */
  async searchSemantic(query: string, limit = 8, ef = 64): Promise<Hit[]> {
    if (!this.wasmIndex || !this.embed) return this.searchLexical(query, limit);
    const vec = await this.embed(query);
    const flat = this.wasmIndex.search(vec, limit * 4, ef);
    const hits: Hit[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      const chunk = this.chunks[flat[i]];
      if (chunk) hits.push({ chunk, score: flat[i + 1] });
    }
    return dedupeByUrl(hits, limit);
  }
}

let singleton: SearchEngine | null = null;
export function getEngine(): SearchEngine {
  if (!singleton) singleton = new SearchEngine();
  return singleton;
}
export type { SearchEngine };
