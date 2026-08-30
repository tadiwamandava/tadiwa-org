import "server-only";

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the op-parity report emitted by `npm run test:nano`.
 *
 * /lab/inference renders this rather than a hand-written list, so the page
 * cannot claim an op works when the test says otherwise. If the report is
 * missing the page says so instead of inventing a state.
 */

export type OpState = "stub" | "pass" | "fail";

export interface OpResult {
  op: string;
  state: OpState;
  maxError: number;
  worstIndex: number;
}

export interface NanoReport {
  tolerance: number;
  ops: OpResult[];
  passing: number;
  stubbed: number;
  failing: number;
}

/** What each op is for, in one line — the page pairs these with the results. */
export const OP_NOTES: Record<string, string> = {
  layernorm:
    "Normalise a row to zero mean and unit variance, then scale and shift. Runs twice per transformer block.",
  softmax:
    "Turn scores into a distribution. Must subtract the row max first, or real logits overflow to NaN.",
  matmul:
    "Where essentially all the time goes. Correct first, then loop order, blocking, and SIMD — each measured.",
  gelu: "The activation inside the MLP. Tanh approximation, which is what GPT-2 was trained against.",
  attention:
    "Scaled dot-product with a causal mask, applied before the softmax. The mask order is the classic bug.",
  residual_add: "The residual connection. Trivial, and the natural first one to do.",
  matmul_i8:
    "Weight-only int8: the codes stay packed and the scale is applied once per output. This is what lets a 135M model sit in 129 MB instead of 513 MB.",
  rmsnorm:
    "LayerNorm without the mean subtraction. Cheaper, and what every model since Llama actually uses.",
  silu: "The SwiGLU gate — x·σ(x), applied to one of the two MLP branches and not the other.",
  rope:
    "Rotary position embedding: position enters as a rotation of query and key pairs. The pairing convention is (i, i + d/2), and getting it wrong is exact at position 0 and worse every token after.",
};

export interface ParityReport {
  weights: "fp32" | "int8";
  tokens: number;
  vocab: number;
  maxAbsDiff: number;
  rmsDiff: number;
  tolerance: number;
  argmaxMatch: boolean;
  pass: boolean;
}

export interface ModelMeta {
  n_embd: number; n_head: number; n_layer: number; block: number;
  vocab: number; params: number;
  trainLoss: number; valLoss: number; corpusBytes: number;
}

/** Written by tools/convert_smollm.py alongside the weights. */
export interface SmolMeta {
  model: string;
  params: number;
  n_embd: number; n_layer: number; n_head: number; n_kv_head: number;
  n_inter: number; vocab: number; n_ctx: number;
  rope_theta: number; rms_eps: number;
}

export interface SmolInfo {
  meta: SmolMeta;
  /** Bytes on disk, or null when this deployment serves the weights from
   *  somewhere else (see NEXT_PUBLIC_NANO_WEIGHTS_BASE in DEPLOY.md). The UI
   *  needs the real number to ask for consent before a 129 MB download, and a
   *  literal in the markup would go stale the first time it was requantised. */
  weightBytes: number | null;
  tokenizerBytes: number | null;
}

function readJson<T>(...segments: string[]): T | null {
  const path = join(process.cwd(), ...segments);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Written by `npm run test:nano:llama`. Same shape as the small model's
 *  report plus the numbers only a 135M model makes interesting. */
export interface SmolParity extends ParityReport {
  argmax: number;
  msPerToken: number;
  residentBytes: number;
}

/** Logit agreement with the PyTorch model the weights came from. */
export function getParity(): ParityReport[] {
  return (["fp32", "int8"] as const)
    .map((t) => readJson<ParityReport>("engines", "nano", "fixtures", `parity-${t}.json`))
    .filter((r): r is ParityReport => r !== null);
}

export function getSmolParity(): SmolParity[] {
  return (["fp32", "int8"] as const)
    .map((t) => readJson<SmolParity>("engines", "nano", "fixtures", `smollm-parity-${t}.json`))
    .filter((r): r is SmolParity => r !== null);
}

export function getModelMeta(): ModelMeta | null {
  return readJson<ModelMeta>("public", "nano", "nano-meta.json");
}

function sizeOf(...segments: string[]): number | null {
  const path = join(process.cwd(), ...segments);
  try {
    return existsSync(path) ? statSync(path).size : null;
  } catch {
    return null;
  }
}

export function getSmolInfo(): SmolInfo | null {
  const meta = readJson<SmolMeta>("public", "nano", "smollm-meta.json");
  if (!meta) return null;
  return {
    meta,
    weightBytes: sizeOf("public", "nano", "smollm-int8.bin"),
    tokenizerBytes: sizeOf("public", "nano", "smollm-tokenizer.bin"),
  };
}

/** Actual size of the compiled engine on disk.
 *  Read rather than hardcoded: a literal here would keep claiming 28 KB after
 *  the next rebuild changed it, and a number that describes a file should come
 *  from the file. */
export function getEngineBytes(): number | null {
  const path = join(process.cwd(), "public", "nano", "nano.wasm");
  if (!existsSync(path)) return null;
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

export function getNanoReport(): NanoReport | null {
  const path = join(process.cwd(), "engines", "nano", "fixtures", "report.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as NanoReport;
  } catch {
    return null;
  }
}
