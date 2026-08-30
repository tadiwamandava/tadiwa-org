/**
 * The grounded prompt format. Pure, no retrieval, no engine, no DOM.
 *
 * Separated from ground.ts because this is the half that has to be reachable
 * from a plain Node process: `npm run check:prompt` pins the rendered output
 * against a golden, and it must import the SAME code the browser runs rather
 * than a copy of it. The moment the checker reimplements the format, it stops
 * checking anything.
 *
 * The strings themselves live in JSON so the Python that generates fine-tuning
 * data reads exactly what the browser serves. Training on one format and
 * serving another degrades output with no error anywhere.
 */

import TEMPLATE from "../../../engines/nano/prompts/grounded.v1.json" with { type: "json" };
import type { Hit } from "@/lib/search/types";

export const REFUSAL = TEMPLATE.refusal;

/** Fills `{name}` placeholders. Deliberately not a template literal: the
 *  format strings live in JSON so Python can read the same ones. */
function fill(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? vars[key] : whole,
  );
}

/**
 * Renders the source block, stopping at whichever budget binds first.
 *
 * The character cap is what keeps the answer from being squeezed out of a
 * 1024-token window by its own context, a failure that looks like the model
 * being terse rather than like a budget being hit.
 */
export function renderSources(passages: Hit[]): string {
  const { maxSources, maxSourceChars } = TEMPLATE.budget;
  const out: string[] = [];
  let chars = 0;
  for (const hit of passages.slice(0, maxSources)) {
    const block = fill(TEMPLATE.source, {
      n: String(out.length + 1),
      title: hit.chunk.title,
      section: hit.chunk.section,
      text: hit.chunk.text,
    });
    if (out.length > 0 && chars + block.length > maxSourceChars) break;
    out.push(block);
    chars += block.length;
  }
  return out.join(TEMPLATE.sourceSeparator);
}

/**
 * The full chat prompt. Shared verbatim with the fine-tuning data generator,
 * see `engines/nano/prompts/grounded.v1.json` for why that matters and
 * `npm run check:prompt` for what stops the two from drifting.
 */
export function groundedPrompt(question: string, passages: Hit[]): string {
  const system = fill(TEMPLATE.system, { sources: renderSources(passages) });
  return (
    `<|im_start|>system\n${system}<|im_end|>\n` +
    `<|im_start|>user\n${question.trim()}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
}

/** How many passages `renderSources` actually kept, so the UI lists exactly
 *  the sources the model was shown rather than everything retrieved. */
export function usedCount(passages: Hit[]): number {
  const rendered = renderSources(passages);
  return rendered === "" ? 0 : rendered.split(TEMPLATE.sourceSeparator).length;
}
