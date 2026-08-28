import "server-only";

import { readFileSync, existsSync } from "node:fs";
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
};

export function getNanoReport(): NanoReport | null {
  const path = join(process.cwd(), "engines", "nano", "fixtures", "report.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as NanoReport;
  } catch {
    return null;
  }
}
