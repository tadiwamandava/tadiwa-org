/**
 * Build-time search index.
 *
 * Produces four artefacts under public/search/:
 *   chunks.json   metadata for every chunk (title, url, kind, text)
 *   lexical.json  a small inverted index — the INSTANT half of search
 *   vectors.bin   int8-quantised embeddings — the SEMANTIC half
 *   (hnsw_bg.wasm is copied here by `npm run build:wasm`)
 *
 * WHY TWO INDEXES. Semantic search needs the *query* embedded at runtime,
 * which means shipping an embedding model to the browser — tens of megabytes,
 * for a portfolio where most visitors will never open search. So the palette
 * answers the first keystroke from `lexical.json` (a few KB, already loaded)
 * and only fetches the model once someone has actually engaged. When it lands,
 * queries re-rank through the HNSW graph. The UI says which mode it is in;
 * claiming "semantic" while serving lexical results would be a lie the user
 * cannot detect, which is the worst kind.
 *
 * The vector payload's layout is defined by crates/hnsw/src/quant.rs and is
 * self-describing (magic + count + dim in the header) so a stale rebuild
 * cannot be silently paired with the wrong metadata.
 *
 * Run: npm run build:search
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import matter from "gray-matter";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CONTENT = join(ROOT, "content");
const OUT = join(ROOT, "public", "search");

/** Matches crates/hnsw/src/quant.rs. */
const MAGIC = 0x31515654;

const MODEL = "Xenova/all-MiniLM-L6-v2";

/** ~60 words with 15 of overlap. Small enough that a hit points at a specific
 *  claim rather than "somewhere in this 2000-word page", overlapped so a
 *  sentence spanning a boundary is still findable from either side. */
const CHUNK_WORDS = 60;
const CHUNK_OVERLAP = 15;

interface Chunk {
  id: number;
  title: string;
  url: string;
  kind: "project" | "post";
  /** Which part of the document this came from — shown as a breadcrumb. */
  section: string;
  text: string;
}

// ---------------------------------------------------------------------------
// corpus -> chunks
// ---------------------------------------------------------------------------

function stripMdx(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")          // fenced code
    .replace(/<[^>]+>/g, " ")                  // JSX/HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")   // links -> text
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function windows(text: string, section: string): Array<{ section: string; text: string }> {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= CHUNK_WORDS) return [{ section, text: words.join(" ") }];

  const out: Array<{ section: string; text: string }> = [];
  const step = CHUNK_WORDS - CHUNK_OVERLAP;
  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + CHUNK_WORDS);
    if (slice.length < 12 && out.length > 0) break; // don't emit a stub tail
    out.push({ section, text: slice.join(" ") });
    if (i + CHUNK_WORDS >= words.length) break;
  }
  return out;
}

function collect(): Chunk[] {
  const chunks: Chunk[] = [];
  let id = 0;

  const push = (
    title: string,
    url: string,
    kind: Chunk["kind"],
    parts: Array<{ section: string; text: string }>,
  ) => {
    for (const p of parts) {
      for (const w of windows(p.text, p.section)) {
        chunks.push({ id: id++, title, url, kind, section: w.section, text: w.text });
      }
    }
  };

  const projectDir = join(CONTENT, "projects");
  if (existsSync(projectDir)) {
    for (const file of readdirSync(projectDir).filter((f) => f.endsWith(".mdx"))) {
      const { data, content } = matter(readFileSync(join(projectDir, file), "utf8"));
      const fm = data as Record<string, unknown>;
      const title = String(fm.title ?? file);
      const url = `/projects/${file.replace(/\.mdx$/, "")}`;

      const parts: Array<{ section: string; text: string }> = [];
      if (fm.pitch) parts.push({ section: "Pitch", text: String(fm.pitch) });
      if (fm.hardestThing) parts.push({ section: "What's hard", text: String(fm.hardestThing) });

      // Design decisions are the highest-signal text in the corpus — they are
      // the part a recruiter is told to look for — so each one is its own
      // chunk rather than being diluted into the body.
      for (const d of (fm.decisions as Array<Record<string, string>>) ?? []) {
        parts.push({
          section: "Decision",
          text: `${d.made}. Rejected: ${d.rejected}. ${d.why}`,
        });
      }
      for (const w of (fm.wouldDoDifferently as string[]) ?? []) {
        parts.push({ section: "Hindsight", text: w });
      }
      for (const b of (fm.resumeBullets as string[]) ?? []) {
        if (/TODO|CONFIRM/i.test(b)) continue; // never index a placeholder
        parts.push({ section: "Summary", text: b });
      }
      parts.push({ section: "Writeup", text: stripMdx(content) });

      push(title, url, "project", parts);
    }
  }

  const postDir = join(CONTENT, "writing");
  if (existsSync(postDir)) {
    for (const file of readdirSync(postDir).filter((f) => f.endsWith(".mdx"))) {
      const { data, content } = matter(readFileSync(join(postDir, file), "utf8"));
      const fm = data as Record<string, unknown>;
      if (fm.draft === true) continue;
      const title = String(fm.title ?? file);
      const url = `/writing/${file.replace(/\.mdx$/, "")}`;
      push(title, url, "post", [
        { section: "Summary", text: String(fm.description ?? "") },
        { section: "Post", text: stripMdx(content) },
      ]);
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// lexical index — BM25 over the same chunks
// ---------------------------------------------------------------------------

const STOP = new Set(
  ("a an and are as at be but by for from had has have i if in into is it its of on or " +
    "that the their then there these they this to was were what when which who will with you")
    .split(" "),
);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function buildLexical(chunks: Chunk[]) {
  // postings: term -> [[chunkId, termFrequency], ...]
  const postings = new Map<string, Array<[number, number]>>();
  const lengths: number[] = [];

  for (const c of chunks) {
    const tokens = tokenize(`${c.title} ${c.section} ${c.text}`);
    lengths.push(tokens.length);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, n] of tf) {
      if (!postings.has(term)) postings.set(term, []);
      postings.get(term)!.push([c.id, n]);
    }
  }

  const avgLen = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  return {
    // BM25 constants are scored in the browser; shipping them keeps the two
    // halves of the algorithm from drifting apart.
    k1: 1.5,
    b: 0.75,
    avgLen,
    lengths,
    postings: Object.fromEntries(postings),
  };
}

// ---------------------------------------------------------------------------
// embeddings -> int8
// ---------------------------------------------------------------------------

function quantize(vectors: Float32Array[], dim: number): Buffer {
  const count = vectors.length;
  const header = Buffer.alloc(16);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(count, 4);
  header.writeUInt32LE(dim, 8);
  header.writeUInt32LE(0, 12);

  const scales = Buffer.alloc(count * 4);
  const codes = Buffer.alloc(count * dim);

  for (let i = 0; i < count; i++) {
    const v = vectors[i];
    let peak = 0;
    for (let j = 0; j < dim; j++) peak = Math.max(peak, Math.abs(v[j]));
    // Per-ROW scale, not per-tensor: these are unit-norm embeddings, so the
    // per-row peak varies little — but a single global scale would let one
    // outlier row crush the resolution of every other one.
    const scale = peak / 127 || 1e-8;
    scales.writeFloatLE(scale, i * 4);
    for (let j = 0; j < dim; j++) {
      const q = Math.max(-127, Math.min(127, Math.round(v[j] / scale)));
      codes.writeInt8(q, i * dim + j);
    }
  }
  return Buffer.concat([header, scales, codes]);
}

async function main() {
  const chunks = collect();
  if (chunks.length === 0) {
    console.error("\n  No content found under content/ — nothing to index.\n");
    process.exit(1);
  }
  console.log(`\n  Chunked ${chunks.length} passages from the corpus.`);

  mkdirSync(OUT, { recursive: true });

  const lexical = buildLexical(chunks);
  writeFileSync(join(OUT, "lexical.json"), JSON.stringify(lexical));
  writeFileSync(
    join(OUT, "chunks.json"),
    JSON.stringify(chunks.map(({ id, title, url, kind, section, text }) => ({
      id, title, url, kind, section,
      // Truncated: the palette shows a snippet, and the full text only ever
      // mattered for building the vectors, which is already done.
      text: text.length > 240 ? `${text.slice(0, 240)}…` : text,
    }))),
  );

  console.log(`  Loading ${MODEL} …  (first run downloads it; subsequent runs are cached)`);
  const { pipeline } = await import("@huggingface/transformers");
  const embed = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });

  const vectors: Float32Array[] = [];
  let dim = 0;
  const BATCH = 16;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH).map((c) => `${c.title}. ${c.text}`);
    const out = await embed(batch, { pooling: "mean", normalize: true });
    const data = out.data as Float32Array;
    dim = out.dims[out.dims.length - 1];
    for (let r = 0; r < batch.length; r++) {
      vectors.push(Float32Array.from(data.subarray(r * dim, (r + 1) * dim)));
    }
    process.stdout.write(`\r  Embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
  console.log("");

  const bin = quantize(vectors, dim);
  writeFileSync(join(OUT, "vectors.bin"), bin);

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`
  Wrote public/search/
    chunks.json   ${kb(JSON.stringify(chunks).length)}
    lexical.json  ${kb(JSON.stringify(lexical).length)}   ${Object.keys(lexical.postings).length} terms
    vectors.bin   ${kb(bin.length)}   ${vectors.length} x ${dim} int8

  MODEL: ${MODEL} (${dim}-dim). The browser must use the SAME model to embed
  queries, or the query lands in a different space and every result is noise.
`);
}

main().catch((err) => {
  console.error("\n  build-embeddings failed:\n", err);
  process.exit(1);
});
