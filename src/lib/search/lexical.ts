import type { Chunk, Hit, LexicalIndex } from "./types";

/**
 * BM25 over the prebuilt inverted index.
 *
 * This is the half of search that answers the first keystroke. It is a few KB
 * on the wire and needs no model, which is why it — not the vector index — is
 * the default. Most visitors will never see anything else.
 */

const STOP = new Set(
  ("a an and are as at be but by for from had has have i if in into is it its of on or " +
    "that the their then there these they this to was were what when which who will with you")
    .split(" "),
);

/**
 * MUST stay identical to `tokenize` in scripts/build-embeddings.ts.
 *
 * If the two drift, query terms stop matching index terms and search silently
 * returns nothing for words that are demonstrably in the corpus — a failure
 * with no error message anywhere.
 */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function bm25(
  query: string,
  index: LexicalIndex,
  chunks: Chunk[],
  limit: number,
): Hit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const n = index.lengths.length;
  const scores = new Map<number, number>();

  for (const term of terms) {
    // Prefix matching on the last term makes the results feel live while
    // someone is still typing a word, rather than going blank until they
    // finish it.
    const exact = index.postings[term];
    const matched: Array<[string, Array<[number, number]>]> = exact
      ? [[term, exact]]
      : Object.entries(index.postings)
          .filter(([t]) => t.startsWith(term))
          .slice(0, 12);

    for (const [, postings] of matched) {
      const df = postings.length;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (const [id, tf] of postings) {
        const len = index.lengths[id] ?? index.avgLen;
        const norm = index.k1 * (1 - index.b + (index.b * len) / index.avgLen);
        scores.set(id, (scores.get(id) ?? 0) + (idf * tf * (index.k1 + 1)) / (tf + norm));
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ chunk: chunks[id], score }))
    .filter((h) => h.chunk !== undefined);
}

/** Collapses chunks to one entry per page, keeping the best-scoring chunk.
 *  Without this a long writeup floods every result with itself. */
export function dedupeByUrl(hits: Hit[], limit: number): Hit[] {
  const seen = new Map<string, Hit>();
  for (const h of hits) {
    const prev = seen.get(h.chunk.url);
    if (!prev || h.score > prev.score) seen.set(h.chunk.url, h);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
