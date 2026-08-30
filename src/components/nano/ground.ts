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
  const ranked =
    stage === "semantic"
      ? await engine.searchPassagesSemantic(question, k + 2)
      : engine.searchPassages(question, k + 2);

  return { passages: withPitch(ranked, engine, k), stage, empty: ranked.length === 0 };
}

/**
 * Guarantees the top page's one-sentence definition is in the context.
 *
 * "What is the K20 Content Curation Platform?" retrieved that project's
 * Writeup, two Decisions and its Hindsight — four passages about it, none of
 * which say what it *is* — and the model correctly declined, because on its
 * inputs there was no answer. Every chunk of a project shares its title, so
 * title terms cannot discriminate between them, and BM25 then ranks the long
 * writeup above the short pitch on raw term frequency.
 *
 * No scoring tweak fixes that; the pitch simply has to be there. So it is
 * pinned rather than ranked: if the best-scoring result belongs to a page that
 * has a Pitch or Summary, that passage takes the first slot. It is one rule,
 * it is why those sections exist in the schema, and it costs one of four.
 *
 * The presence check runs on the KEPT slice, not the over-fetched list. The
 * first version checked all six candidates, found the pitch at rank five,
 * concluded there was nothing to do — and then the truncation to four threw it
 * away again. The bug survived a browser test and was only caught by asking
 * why the browser still refused.
 */
function withPitch(hits: Hit[], engine: ReturnType<typeof getEngine>, k: number): Hit[] {
  const best = hits[0];
  if (!best) return hits;

  const kept = hits.slice(0, k);
  const defining = (h: Hit) => h.chunk.url === best.chunk.url && isDefining(h.chunk.section);
  if (kept.some(defining)) return kept;

  const pitch =
    hits.find(defining)?.chunk ??
    engine.passagesForUrl(best.chunk.url).find((c) => isDefining(c.section));
  if (!pitch) return kept;
  return [{ chunk: pitch, score: best.score }, ...kept].slice(0, k);
}

function isDefining(section: string): boolean {
  return section === "Pitch" || section === "Summary";
}
