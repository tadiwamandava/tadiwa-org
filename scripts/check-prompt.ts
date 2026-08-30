/**
 * Pins the grounded prompt against a golden rendering.
 *
 * WHY. The prompt format is built in two languages: TypeScript renders it in
 * the browser, Python renders it to generate fine-tuning data. A model trained
 * on one format and served another degrades with no error anywhere — the same
 * silent-failure shape as the search tokenizer being implemented twice, which
 * is what `check:search` exists for.
 *
 * Both sides read `engines/nano/prompts/grounded.v1.json`, so they cannot
 * disagree about the *strings*. They can still disagree about how those
 * strings are assembled, and that is what this checks: one fixed question,
 * three fixed passages, one byte-exact expected result.
 *
 * If this fails after a deliberate format change, regenerate the golden AND
 * regenerate the training data. A format change without retraining is the
 * failure this file is here to make loud.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { groundedPrompt, renderSources, usedCount } from "../src/components/nano/prompt.ts";
import type { Hit } from "../src/lib/search/types.ts";

const GOLDEN = join(process.cwd(), "engines", "nano", "fixtures", "grounded-prompt.txt");

/** Fixed input. Not drawn from the live corpus on purpose — this test must
 *  fail when the FORMAT changes and stay quiet when the content does. */
const QUESTION = "What is tadiwa-nano?";
const PASSAGES: Hit[] = [
  {
    score: 9.5,
    chunk: {
      id: 1,
      title: "tadiwa-nano",
      url: "/lab/inference",
      kind: "project",
      section: "Pitch",
      text: "A transformer forward pass written by hand in C++ and compiled to WebAssembly, with no framework and no server call.",
    },
  },
  {
    score: 7.25,
    chunk: {
      id: 2,
      title: "tadiwa-nano",
      url: "/lab/inference",
      kind: "project",
      section: "Hardest thing",
      text: "Grouped-query attention: nine query heads share three key/value heads, and a query head reading the wrong group produces fluent text that is subtly wrong.",
    },
  },
  {
    score: 3.5,
    chunk: {
      id: 3,
      title: "Build gates that argue back",
      url: "/writing/build-gates-that-argue-back",
      kind: "post",
      section: "Opening",
      text: "A gate you have never seen fail is not a gate. It is a decoration that happens to exit zero.",
    },
  },
];

function main(): number {
  const got = groundedPrompt(QUESTION, PASSAGES);

  // Structural assertions, so a passing diff is not the only evidence.
  const problems: string[] = [];
  if (!got.includes("<|im_start|>system")) problems.push("no system turn");
  if (!got.endsWith("<|im_start|>assistant\n")) problems.push("does not end on the assistant header");
  if (!got.includes("[1] tadiwa-nano — Pitch")) problems.push("source 1 not rendered");
  if (!got.includes("[3] Build gates")) problems.push("source 3 not rendered");
  if (usedCount(PASSAGES) !== 3) problems.push(`usedCount says ${usedCount(PASSAGES)}, expected 3`);
  if (renderSources([]).length !== 0) problems.push("empty passages did not render empty");

  if (process.argv.includes("--write") || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, got);
    console.log(`\n  wrote ${GOLDEN}\n  ${got.length} bytes\n`);
    return problems.length === 0 ? 0 : 1;
  }

  const want = readFileSync(GOLDEN, "utf8");
  if (want !== got) {
    console.error("\n  PROMPT FORMAT CHANGED\n");
    const w = want.split("\n");
    const g = got.split("\n");
    for (let i = 0; i < Math.max(w.length, g.length); i++) {
      if (w[i] !== g[i]) {
        console.error(`  line ${i + 1}`);
        console.error(`    golden: ${JSON.stringify(w[i] ?? "<missing>")}`);
        console.error(`    got:    ${JSON.stringify(g[i] ?? "<missing>")}`);
      }
    }
    console.error(
      "\n  If this change is intended, run `npm run check:prompt -- --write`\n" +
        "  AND regenerate the fine-tuning data. Training on one format and\n" +
        "  serving another is silent, not loud.\n",
    );
    return 1;
  }

  if (problems.length > 0) {
    console.error("\n  " + problems.join("\n  ") + "\n");
    return 1;
  }

  console.log(
    `\n  Grounded prompt matches the golden rendering (${got.length} bytes, ` +
      `${usedCount(PASSAGES)} sources).\n\n  PASSED\n`,
  );
  return 0;
}

process.exit(main());
