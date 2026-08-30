/**
 * Retrieval-augmented prompting for the in-browser model.
 *
 * WHY THIS EXISTS. SmolLM2-135M asked "what is a KV cache" answers that it
 * "stores the current and voltage values from previous cycles" — it does not
 * know, so it interpolates from things that sound adjacent. That is not a
 * training-objective problem and no amount of fine-tuning at 135M parameters
 * fixes it: the model has nowhere to keep the fact.
 *
 * So it is not asked to recall. The BM25 index that already answers ⌘K
 * retrieves the passages, they go into the prompt, and the model's job drops
 * from "know things" to "read four paragraphs and answer from them" — which
 * is a job a 135M model can actually do.
 *
 * The retrieval costs ~80 KB of JSON and no model. It is the cheap half of the
 * page doing the work the expensive half cannot.
 */

import TEMPLATE from "../../../engines/nano/prompts/grounded.v1.json" with { type: "json" };
import { getEngine } from "@/lib/search/engine";
import type { Hit } from "@/lib/search/types";

export { REFUSAL, renderSources, groundedPrompt, usedCount } from "./prompt";

export interface Grounding {
  passages: Hit[];
  /** Which index produced them — shown in the UI, because claiming semantic
   *  while serving lexical is a lie the visitor cannot detect. */
  stage: "lexical" | "semantic";
  /** True when nothing in the corpus matched. The caller should refuse
   *  directly rather than spend a forward pass proving it. */
  empty: boolean;
}

/**
 * Loads the lexical index if needed and retrieves for one question.
 *
 * Uses the vector index when it is already loaded — /lab/search and the ⌘K
 * palette both warm it — but never triggers the 22 MB model download on its
 * own. A grounded answer that silently costs 22 MB is not an improvement.
 */
export async function retrieve(question: string): Promise<Grounding> {
  const engine = getEngine();
  await engine.loadLexical();

  const k = TEMPLATE.budget.maxSources;
  const stage: Grounding["stage"] = engine.semanticReady ? "semantic" : "lexical";
  const passages =
    stage === "semantic"
      ? await engine.searchPassagesSemantic(question, k)
      : engine.searchPassages(question, k);

  return { passages, stage, empty: passages.length === 0 };
}
