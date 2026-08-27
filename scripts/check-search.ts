/**
 * Search gate.
 *
 * Runs the SHIPPED lexical index through the SHIPPED scorer and asserts that
 * known queries reach the right page.
 *
 * The specific bug this exists to catch: `tokenize()` is implemented twice —
 * once in scripts/build-embeddings.ts to build the index, once in
 * src/lib/search/lexical.ts to score queries against it. If those two ever
 * drift, search silently returns nothing for words that are demonstrably in
 * the corpus. No error, no warning, no failing build — just a search box that
 * quietly stops working. This script imports the runtime scorer and reads the
 * built artefacts, so a drift fails here instead of in front of a recruiter.
 *
 * Run: npm run check:search   (after npm run build:search)
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { bm25, dedupeByUrl } from "../src/lib/search/lexical.ts";
import type { Chunk, LexicalIndex } from "../src/lib/search/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../public/search");

/** query -> a URL that MUST appear in the top 3. */
const EXPECTATIONS: Array<[string, string]> = [
  ["lsm compaction", "/projects/lsm-storage-engine"],
  ["crash safe key value store", "/projects/lsm-storage-engine"],
  ["risc-v pipeline verification", "/projects/riscv-cpu-verification"],
  ["constrained random testbench", "/projects/riscv-cpu-verification"],
  ["context switch pendsv", "/projects/rtos-stm32"],
  ["quantisation int8", "/projects/llm-inference-engine"],
  ["cublas kernel", "/projects/cuda-matmul"],
  ["keyboard firmware usb", "/projects/mechanical-keyboard"],
  ["typescript migration client", "/projects/k20-curation"],
  ["raft consensus", "/projects/raft-replicated-kv"],
  ["contrast checker accessibility", "/writing/build-gates-that-argue-back"],
];

function run(): number {
  for (const f of ["chunks.json", "lexical.json"]) {
    if (!existsSync(join(OUT, f))) {
      console.error(`\n  public/search/${f} is missing — run 'npm run build:search'.\n`);
      return 1;
    }
  }

  const chunks: Chunk[] = JSON.parse(readFileSync(join(OUT, "chunks.json"), "utf8"));
  const index: LexicalIndex = JSON.parse(readFileSync(join(OUT, "lexical.json"), "utf8"));

  console.log(
    `\n  ${chunks.length} chunks · ${Object.keys(index.postings).length} terms\n`,
  );

  let failures = 0;
  for (const [query, expected] of EXPECTATIONS) {
    const hits = dedupeByUrl(bm25(query, index, chunks, 24), 3);
    const urls = hits.map((h) => h.chunk.url);
    const rank = urls.indexOf(expected);
    const ok = rank !== -1;
    if (!ok) failures++;
    console.log(
      `  ${ok ? "✓" : "✗"} ${query.padEnd(34)} ${
        ok ? `#${rank + 1}` : `missed — got ${urls[0] ?? "(nothing)"}`
      }`,
    );
  }

  // A query of pure stop-words must return nothing rather than everything.
  const noise = dedupeByUrl(bm25("the and of it", index, chunks, 10), 5);
  if (noise.length > 0) {
    failures++;
    console.log(`  ✗ stop-word-only query returned ${noise.length} results`);
  } else {
    console.log(`  ✓ ${"stop-word-only query returns nothing".padEnd(34)} ok`);
  }

  console.log("");
  if (failures > 0) {
    console.error(`  FAILED — ${failures} search expectation(s) not met.\n`);
    return 1;
  }
  console.log(`  PASSED — ${EXPECTATIONS.length + 1} search expectations met.\n`);
  return 0;
}

process.exit(run());
