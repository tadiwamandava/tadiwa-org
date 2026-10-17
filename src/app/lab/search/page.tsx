import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { Container } from "@/components/ui";
import { Code, LabSection, Readout } from "@/components/lab/parts";
import { SearchLabMount } from "@/components/lab/search-lab-mount";

/* ============================================================================
   /lab/search

   The page is a server component that renders prose and one client island. The
   island does every measurement; nothing on this side of the boundary asserts a
   number it did not read off disk at build time.

   That last part is deliberate. "43 KB of WebAssembly over 97 chunks" is the
   kind of sentence that is true the week it is written and quietly wrong three
   rebuilds later, so the figures below are read out of public/search at build
   time, from the same files the browser fetches. A stale number here would
   have to survive a rebuild that changed the file it was measuring, which it
   cannot.
   ========================================================================= */

export const metadata: Metadata = {
  title: "Vector search, client-side",
  description:
    "Inspect a Rust HNSW index in your browser and compare its search results, recall, and query timings with a full scan of this site's content.",
};

const SEARCH_DIR = join(process.cwd(), "public", "search");

/** Everything quoted in the prose, read from the shipped artefacts. */
function shippedFacts() {
  const wasm = readFileSync(join(SEARCH_DIR, "hnsw_bg.wasm"));
  const vectors = readFileSync(join(SEARCH_DIR, "vectors.bin"));
  const view = new DataView(vectors.buffer, vectors.byteOffset, vectors.byteLength);
  return {
    wasmBytes: wasm.byteLength,
    wasmGzip: gzipSync(wasm).byteLength,
    vectorBytes: vectors.byteLength,
    lexicalBytes: readFileSync(join(SEARCH_DIR, "lexical.json")).byteLength,
    count: view.getUint32(4, true),
    dim: view.getUint32(8, true),
  };
}

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`;

export default function SearchLabPage() {
  const facts = shippedFacts();

  return (
    <article>
      <header className="border-b border-border bg-surface">
        <Container className="py-14">
          <p className="text-2xs text-subtle">
            <Link href="/lab" className="hover:text-accent">
              Lab
            </Link>{" "}
            / Vector search
          </p>

          <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight">
            Vector search in your browser.
          </h1>

          <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted">
            A Rust HNSW graph searches {facts.count} passages from this site.
            Inspect its layers, run a query, and compare its results with a full
            scan. The WebAssembly engine is {kb(facts.wasmGzip)} when gzipped.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Readout value={String(facts.count)} label="chunks indexed" />
            <Readout value={String(facts.dim)} label="dimensions per vector" />
            <Readout
              value={kb(facts.vectorBytes)}
              label="int8 vector payload"
              title="384 float32 dimensions per chunk would be four times this."
            />
            <Readout value={kb(facts.lexicalBytes)} label="keyword index" />
          </div>
        </Container>
      </header>

      <Container className="py-14">
        <LabSection label="What this is">
          <div className="prose mt-5">
            <p>
              The site search starts with BM25 keyword matching. Optional
              semantic search uses an HNSW graph over int8 vectors. This demo
              exposes that graph, built by <Code>Index::build</Code> when you
              open the page.
            </p>
            <p>
              I implemented graph construction, neighbour selection, search,
              the quantised vector format, and WebAssembly bindings in{" "}
              <Code>crates/hnsw/src/</Code>. Select an existing passage to query
              immediately, or download the embedding model to enter your own text.
            </p>
            <p>
              With only {facts.count} passages, a full scan is a useful baseline.
              Each recall measurement compares the graph&apos;s results against{" "}
              <Code>brute_force</Code>. Timings are measured in this tab; adjust
              the search effort to see its effect on recall and computation.
            </p>
          </div>
        </LabSection>

        <SearchLabMount />

        <LabSection label="Where the code is">
          <div className="prose mt-5">
            <p>
              <Code>crates/hnsw/src/hnsw.rs</Code> is the algorithm, with no
              WebAssembly in it: construction, ALG 4&rsquo;s neighbour heuristic,
              the layer descent, and a brute-force scan kept for grading.{" "}
              <Code>quant.rs</Code> is the on-the-wire vector format.{" "}
              <Code>lib.rs</Code> handles the JavaScript boundary and the
              introspection API used here. The Rust tests compare recall with
              exhaustive search results.
            </p>
            <p>
              Other things you can run are in the{" "}
              <Link href="/lab">lab</Link>.
            </p>
          </div>
        </LabSection>
      </Container>
    </article>
  );
}
