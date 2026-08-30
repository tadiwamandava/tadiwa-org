/**
 * Browser driver for the Llama-family engine — SmolLM2-135M-Instruct.
 *
 * Same C++ forward pass as the CLI, same WASM module as the small model. What
 * this file adds is everything the browser makes hard and a terminal does not:
 *
 *   - A 129 MB download that must show progress, survive a reload, and land in
 *     the WASM heap without ever existing twice.
 *   - A prefill measured in seconds that must not freeze the tab.
 *   - A chat template, because an *Instruct* model asked a bare question
 *     answers a different question than the one you typed.
 */

import { getModule, type NanoModule } from "./engine";

/** Where the weights live. Same-origin `/nano` by default; a deployment that
 *  cannot serve a 129 MB file from its own origin points this at one that can
 *  (see DEPLOY.md). Inlined at build time — it is a public URL, not a secret. */
const BASE = process.env.NEXT_PUBLIC_NANO_WEIGHTS_BASE ?? "/nano";

export const WEIGHTS_URL = `${BASE}/smollm-int8.bin`;
export const TOKENIZER_URL = `${BASE}/smollm-tokenizer.bin`;

/** Survives a reload, so the 129 MB is paid once per browser rather than once
 *  per visit. Versioned in the name, and the version is not decoration: the
 *  URL does not change when the weights are re-quantised or fine-tuned, so a
 *  cache hit on the previous file would silently serve a model the page is
 *  describing incorrectly. Bump this on every weights change.
 *
 *  v4: the grounded LoRA merged in. */
const CACHE = "nano-weights-v4";

export interface LlamaInfo {
  nVocab: number;
  nCtx: number;
  nEmbd: number;
  nHead: number;
  nKvHead: number;
  nLayer: number;
  nInter: number;
  quant: number;
  /** Weights plus KV cache, straight from the engine. */
  residentBytes: number;
  kvBytes: number;
  downloadBytes: number;
}

export interface LoadProgress {
  /** What is being fetched right now. */
  what: "tokenizer" | "weights" | "parsing";
  received: number;
  total: number;
  /** True when the bytes came from the browser cache rather than the network. */
  cached: boolean;
}

export interface GenStats {
  promptTokens: number;
  tokens: number;
  prefillMs: number;
  genMs: number;
  stopped: "eos" | "limit" | "context" | "user";
}

const SYSTEM = "You are a helpful AI assistant named SmolLM.";

/**
 * Wraps a question in the turn structure SmolLM2-Instruct was fine-tuned on.
 *
 * The special tokens are literal text here and the tokeniser splits on them —
 * which is exactly why the C++ BPE had to learn about added tokens. Without
 * that, `<|im_start|>` tokenises as twelve ordinary bytes, the model never
 * sees a turn boundary, and it continues the transcript instead of answering.
 */
export function chatPrompt(user: string, system: string = SYSTEM): string {
  return (
    `<|im_start|>system\n${system}<|im_end|>\n` +
    `<|im_start|>user\n${user}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
}

/** HEAD the weights so the UI can say "129 MB" — or "not on this deployment" —
 *  before asking anyone to commit to a download. */
export async function probeWeights(): Promise<number | null> {
  try {
    const res = await fetch(WEIGHTS_URL, { method: "HEAD" });
    if (!res.ok) return null;
    const n = Number(res.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Streams a URL straight into the WASM heap.
 *
 * The naive version — `await res.arrayBuffer()`, then copy — peaks at twice
 * the file size and reports no progress. This reserves the exact length up
 * front from `content-length` and writes each chunk at its offset, so 129 MB
 * of weights exist once, in the only address space that needs them.
 *
 * If `content-length` is missing (a proxy re-encoding the body, say) there is
 * nothing to reserve, so it falls back to buffering and says so by leaving
 * `total` at 0 in the progress callbacks.
 */
async function streamIntoHeap(
  mod: NanoModule,
  url: string,
  what: LoadProgress["what"],
  onProgress: (p: LoadProgress) => void,
): Promise<void> {
  let cached = false;
  let res: Response | undefined;

  // Cache API is unavailable on insecure origins and in some private modes.
  // It is an optimisation, so a failure here is not an error.
  let store: Cache | null = null;
  try {
    store = await caches.open(CACHE);
    const hit = await store.match(url);
    if (hit) {
      res = hit;
      cached = true;
    }
  } catch {
    store = null;
  }

  if (!res) {
    const net = await fetch(url);
    if (!net.ok) throw new Error(`${url}: HTTP ${net.status}`);
    if (store) {
      // Store a clone before the body is consumed; a Response body reads once.
      try {
        await store.put(url, net.clone());
      } catch {
        /* quota, most likely — the download still works, it just won't stick */
      }
    }
    res = net;
  }

  const total = Number(res.headers.get("content-length")) || 0;
  onProgress({ what, received: 0, total, cached });

  if (!total || !res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    const ptr = mod._llama_stage(buf.length);
    if (!ptr) throw new Error(mod.UTF8ToString(mod._llama_last_error()));
    mod.HEAPU8.set(buf, ptr);
    onProgress({ what, received: buf.length, total: buf.length, cached });
    return;
  }

  const ptr = mod._llama_stage(total);
  if (!ptr) throw new Error(mod.UTF8ToString(mod._llama_last_error()));

  const reader = res.body.getReader();
  let at = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.length > total) throw new Error(`${url}: body longer than content-length`);
    // HEAPU8 is re-read here rather than hoisted: _llama_stage grew the heap
    // and any view taken before that call is detached.
    mod.HEAPU8.set(value, ptr + at);
    at += value.length;
    onProgress({ what, received: at, total, cached });
  }
  if (at !== total) throw new Error(`${url}: got ${at} of ${total} bytes`);
}

export class LlamaEngine {
  private mod: NanoModule | null = null;
  private scratch = 0;
  private eos = -1;
  loaded = false;
  info: LlamaInfo | null = null;

  /** Fetches the tokenizer and weights and hands both to the engine.
   *  Idempotent: a second call after a successful load does nothing. */
  async load(onProgress: (p: LoadProgress) => void): Promise<void> {
    if (this.loaded) return;
    const mod = (this.mod ??= await getModule());

    // Tokenizer first. It is 1 MB against 129, and if the vocabulary is broken
    // there is no reason to spend the visitor's bandwidth finding that out.
    await streamIntoHeap(mod, TOKENIZER_URL, "tokenizer", onProgress);
    if (mod._llama_commit_tokenizer() !== 1) {
      throw new Error(`tokenizer: ${mod.UTF8ToString(mod._llama_last_error())}`);
    }

    let downloadBytes = 0;
    await streamIntoHeap(mod, WEIGHTS_URL, "weights", (p) => {
      downloadBytes = p.total || p.received;
      onProgress(p);
    });
    onProgress({ what: "parsing", received: downloadBytes, total: downloadBytes, cached: false });

    // Yield once so the "parsing" state paints — commit walks 129 MB of
    // headers and is long enough to be visible.
    await new Promise((r) => setTimeout(r, 0));
    if (mod._llama_commit_weights() !== 1) {
      throw new Error(`weights: ${mod.UTF8ToString(mod._llama_last_error())}`);
    }

    this.scratch ||= mod._malloc(256);
    this.eos = this.specialId("<|im_end|>");
    this.loaded = true;
    this.info = {
      nVocab: mod._llama_n_vocab(),
      nCtx: mod._llama_n_ctx(),
      nEmbd: mod._llama_n_embd(),
      nHead: mod._llama_n_head(),
      nKvHead: mod._llama_n_kv_head(),
      nLayer: mod._llama_n_layer(),
      nInter: mod._llama_n_inter(),
      quant: mod._llama_quant(),
      residentBytes: mod._llama_resident_bytes(),
      kvBytes: mod._llama_kv_bytes(),
      downloadBytes,
    };
  }

  private specialId(text: string): number {
    const mod = this.mod!;
    const bytes = new TextEncoder().encode(text);
    const ptr = mod._malloc(bytes.length + 1);
    try {
      mod.HEAPU8.set(bytes, ptr);
      mod.HEAPU8[ptr + bytes.length] = 0;
      return mod._llama_special(ptr);
    } finally {
      mod._free(ptr);
    }
  }

  /**
   * Runs a completion, streaming decoded text to `onToken`.
   *
   * Both loops yield to the event loop, for the same reason and with different
   * urgency. Prefill is one long blocking stretch the visitor did not ask for
   * and cannot interrupt; generation is where they watch and where Stop has to
   * work. Neither can run to completion inside a single task.
   */
  async generate(
    prompt: string,
    opts: {
      maxTokens: number;
      temperature: number;
      topP: number;
      repeatPenalty: number;
      seed: number;
      /** Stop when the model emits `<|im_end|>`. Off for raw completion, where
       *  there is no turn to end. */
      stopAtEos: boolean;
    },
    onPrefill: (done: number, total: number) => void,
    onToken: (text: string, count: number) => void,
    shouldStop: () => boolean,
  ): Promise<GenStats> {
    const mod = this.mod;
    if (!mod || !this.loaded) throw new Error("engine not loaded");

    const bytes = new TextEncoder().encode(prompt);
    const ptr = mod._malloc(bytes.length + 1);
    let promptTokens = 0;
    try {
      mod.HEAPU8.set(bytes, ptr);
      promptTokens = mod._llama_begin(ptr, bytes.length, opts.seed >>> 0);
    } finally {
      mod._free(ptr);
    }
    if (promptTokens < 0) throw new Error(mod.UTF8ToString(mod._llama_last_error()));

    const t0 = performance.now();
    for (let fed = 0; ; ) {
      const left = mod._llama_prefill_step();
      fed = promptTokens - left;
      onPrefill(fed, promptTokens);
      if (left <= 0) break;
      // Every 8 tokens rather than every one: a yield costs a task round-trip,
      // and 8 forwards is still well under a frame's worth of blocking.
      if (fed % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const t1 = performance.now();

    const decoder = new TextDecoder("utf-8");
    const buf = new Uint8Array(256);
    let produced = 0;
    let stopped: GenStats["stopped"] = "limit";

    for (let i = 0; i < opts.maxTokens; i++) {
      if (shouldStop()) { stopped = "user"; break; }
      const id = mod._llama_next(opts.temperature, opts.topP, opts.repeatPenalty);
      if (id < 0) { stopped = "context"; break; }
      if (opts.stopAtEos && id === this.eos) { stopped = "eos"; break; }

      const n = mod._llama_token_bytes(id, this.scratch, buf.length);
      produced++;
      if (n > 0) {
        buf.set(mod.HEAPU8.subarray(this.scratch, this.scratch + n));
        // `stream: true` holds a partial UTF-8 sequence until the rest
        // arrives instead of emitting U+FFFD — BPE ids split characters.
        const text = decoder.decode(buf.subarray(0, n), { stream: true });
        if (text) onToken(text, produced);
      }
      // One yield per token. At ~20 tok/s in WASM that is 50 ms of work
      // between paints, which is what makes the text appear to stream.
      await new Promise((r) => setTimeout(r, 0));
    }

    const tail = decoder.decode();
    if (tail) onToken(tail, produced);

    if (this.info) {
      this.info.residentBytes = mod._llama_resident_bytes();
      this.info.kvBytes = mod._llama_kv_bytes();
    }
    return {
      promptTokens,
      tokens: produced,
      prefillMs: t1 - t0,
      genMs: performance.now() - t1,
      stopped,
    };
  }
}
