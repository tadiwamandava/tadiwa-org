/**
 * Browser-side driver for the tadiwa-nano WebAssembly engine.
 *
 * Generation is stepped one token at a time from here rather than looped
 * inside WASM. A loop in C++ would block the main thread for the whole
 * completion, no streaming, no stopping. A call per token costs microseconds
 * and buys both.
 */

export type Precision = "fp32" | "int8";

export interface EngineInfo {
  nVocab: number;
  nCtx: number;
  nEmbd: number;
  nHead: number;
  nLayer: number;
  quant: number;
  weightBytes: number;
  downloadBytes: number;
}

export interface NanoModule {
  /** Re-read on every use. ALLOW_MEMORY_GROWTH detaches and replaces this
   *  view whenever the heap grows, and staging a 129 MB model definitely
   *  grows it, a reference cached across that call points at a dead buffer. */
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _nano_load(ptr: number, len: number): number;
  _nano_last_error(): number;
  _nano_n_vocab(): number;
  _nano_n_ctx(): number;
  _nano_n_embd(): number;
  _nano_n_head(): number;
  _nano_n_layer(): number;
  _nano_quant(): number;
  _nano_weight_bytes(): number;
  _nano_pos(): number;
  _nano_prime(ptr: number, len: number, seed: number): number;
  _nano_next(temperature: number, topP: number): number;
  _nano_token_byte(id: number): number;

  // The Llama-family surface, SmolLM2 and anything with its shape.
  _llama_stage(len: number): number;
  _llama_commit_tokenizer(): number;
  _llama_commit_weights(): number;
  _llama_last_error(): number;
  _llama_ready(): number;
  _llama_n_vocab(): number;
  _llama_n_ctx(): number;
  _llama_n_embd(): number;
  _llama_n_head(): number;
  _llama_n_kv_head(): number;
  _llama_n_layer(): number;
  _llama_n_inter(): number;
  _llama_quant(): number;
  _llama_pos(): number;
  _llama_resident_bytes(): number;
  _llama_kv_bytes(): number;
  _llama_special(ptr: number): number;
  _llama_begin(ptr: number, len: number, seed: number): number;
  _llama_prefill_step(): number;
  _llama_next(temperature: number, topP: number, repeatPenalty: number): number;
  _llama_token_bytes(id: number, out: number, cap: number): number;

  UTF8ToString(ptr: number): string;
}

let modPromise: Promise<NanoModule> | null = null;

/** The one WASM instance. Both engines are compiled into it, so loading the
 *  small model and then the large one costs one module, not two. */
export async function getModule(): Promise<NanoModule> {
  if (!modPromise) {
    modPromise = (async () => {
      // The specifier is a variable on purpose. Emscripten's glue is a build
      // artefact served from /public, not a module in the graph, a literal
      // here makes the bundler try to resolve it at compile time and fail.
      const url = "/nano/nano.mjs";
      const factory = (await import(/* webpackIgnore: true */ url)) as {
        default: (o?: object) => Promise<NanoModule>;
      };
      return factory.default({});
    })();
  }
  return modPromise;
}

export class NanoEngine {
  private mod: NanoModule | null = null;
  private loaded: Precision | null = null;
  info: EngineInfo | null = null;

  get precision(): Precision | null {
    return this.loaded;
  }

  /** Fetches a weights file and hands it to the engine. Idempotent per precision. */
  async load(precision: Precision): Promise<void> {
    if (this.loaded === precision) return;
    const mod = (this.mod ??= await getModule());

    const res = await fetch(`/nano/nano-${precision}.bin`);
    if (!res.ok) throw new Error(`weights ${precision}: HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());

    // Copy across the WASM boundary. The heap is a separate address space;
    // there is no way to hand it a JS-owned buffer.
    const ptr = mod._malloc(buf.length);
    try {
      mod.HEAPU8.set(buf, ptr);
      if (mod._nano_load(ptr, buf.length) !== 1) {
        throw new Error(mod.UTF8ToString(mod._nano_last_error()));
      }
    } finally {
      mod._free(ptr);
    }

    this.loaded = precision;
    this.info = {
      nVocab: mod._nano_n_vocab(),
      nCtx: mod._nano_n_ctx(),
      nEmbd: mod._nano_n_embd(),
      nHead: mod._nano_n_head(),
      nLayer: mod._nano_n_layer(),
      quant: mod._nano_quant(),
      weightBytes: mod._nano_weight_bytes(),
      downloadBytes: buf.length,
    };
  }

  /**
   * Streams a completion. `onChunk` receives decoded text as it arrives.
   *
   * The vocabulary is byte-level, so a single token can be one third of a
   * character, the bytes go through a streaming TextDecoder, which holds an
   * incomplete sequence until the rest arrives instead of emitting U+FFFD.
   */
  async generate(
    prompt: string,
    maxTokens: number,
    temperature: number,
    topP: number,
    seed: number,
    onChunk: (text: string, tokensSoFar: number) => void,
    shouldStop: () => boolean,
  ): Promise<{ tokens: number; ms: number }> {
    const mod = this.mod;
    if (!mod) throw new Error("engine not loaded");

    const bytes = new TextEncoder().encode(prompt);
    const ptr = mod._malloc(bytes.length + 1);
    try {
      mod.HEAPU8.set(bytes, ptr);
      mod._nano_prime(ptr, bytes.length, seed >>> 0);
    } finally {
      mod._free(ptr);
    }

    const decoder = new TextDecoder("utf-8");
    const t0 = performance.now();
    let produced = 0;
    let pending: number[] = [];

    for (let i = 0; i < maxTokens; i++) {
      if (shouldStop()) break;
      const id = mod._nano_next(temperature, topP);
      if (id < 0) break;            // context window full
      const byte = mod._nano_token_byte(id);
      if (byte < 0) break;
      pending.push(byte);
      produced++;

      // Flush every few tokens: one repaint per token is wasted work, and the
      // decoder needs whole sequences anyway.
      if (pending.length >= 4) {
        const text = decoder.decode(new Uint8Array(pending), { stream: true });
        pending = [];
        if (text) onChunk(text, produced);
        // Yield so the browser can paint and the stop button can be pressed.
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (pending.length) {
      const tail = decoder.decode(new Uint8Array(pending), { stream: true });
      if (tail) onChunk(tail, produced);
    }
    const flush = decoder.decode();
    if (flush) onChunk(flush, produced);

    return { tokens: produced, ms: performance.now() - t0 };
  }
}
