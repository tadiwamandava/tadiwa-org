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

   That last part is deliberate. "43 KB of WebAssembly over 99 chunks" is the
   kind of sentence that is true the week it is written and quietly wrong three
   rebuilds later, so the figures below are read out of public/search at build
   time — from the same files the browser fetches. A stale number here would
   have to survive a rebuild that changed the file it was measuring, which it
   cannot.
   ========================================================================= */

export const metadata: Metadata = {
  title: "Vector search, client-side",
  description:
    "An HNSW index written in Rust and compiled to WebAssembly, searching this site in your browser — with its layer structure drawn, its recall measured live against an exhaustive scan, and an honest account of what it does not buy.",
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
          <p className="font-mono text-2xs tracking-[0.14em] text-subtle uppercase">
            <Link href="/lab" className="hover:text-accent">
              Lab
            </Link>{" "}
            / Vector search
          </p>

          <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight">
            A vector index that demonstrates itself.
          </h1>

          <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted">
            An HNSW graph I wrote in Rust and compiled to WebAssembly —{" "}
            {kb(facts.wasmBytes)} raw, {kb(facts.wasmGzip)} over the wire —
            searching {facts.count} chunks of this site&rsquo;s own writing
            entirely inside your browser. Everything below is measured in this
            tab while you read it, including the part where the graph loses.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Readout value={String(facts.count)} label="chunks indexed" />
            <Readout value={String(facts.dim)} label="dimensions per vector" />
            <Readout
              value={kb(facts.vectorBytes)}
              label="int8 vector payload"
              title="384 float32 dimensions per chunk would be four times this."
            />
            <Readout value="0" label="network calls per query" />
          </div>
        </Container>
      </header>

      <Container className="py-14">
        <LabSection label="What this is">
          <div className="prose mt-5">
            <p>
              Search on this site has two stages. The first is BM25 over an
              inverted index — 80 KB of JSON, scored in the main thread, and the
              only stage almost anyone will ever reach. The second is this one: a
              hierarchical navigable small world graph over int8-quantised
              document vectors, built by <Code>Index::build</Code> the moment you
              opened this page, answering queries by walking a graph instead of
              scanning a list.
            </p>
            <p>
              I wrote the graph rather than installed it — construction, the
              neighbour-selection heuristic, the search, the quantised vector
              format and the WebAssembly bindings are in{" "}
              <Code>crates/hnsw/src/</Code>, in about 1,200 lines of Rust with
              the paper&rsquo;s algorithm numbers in the comments. What the
              browser downloads for it is {kb(facts.wasmGzip)}.
            </p>
            <p>
              The honest part comes first, because it is the part a demo page
              usually buries: <strong>at {facts.count} chunks, a brute-force scan
              is already sub-millisecond</strong>, so the graph is not saving
              meaningful time here and the measurements below will show it doing
              roughly the same amount of arithmetic as the scan it replaces. It
              earns its place because the structure is the point, and because it
              is still sub-millisecond when the corpus is a hundred times larger
              — which is also measured below rather than claimed.
            </p>
            <p>
              An index that cannot be checked is a claim, not evidence. So{" "}
              <Code>brute_force</Code> is a first-class method of the crate, not
              a test helper: it is the ground truth every recall number on this
              page is computed against, sharing the same arithmetic and the same
              vectors as the graph it is grading.
            </p>
          </div>
        </LabSection>

        <SearchLabMount />

        <LabSection label="Where the code is">
          <div className="prose mt-5">
            <p>
              <Code>crates/hnsw/src/hnsw.rs</Code> is the algorithm, with no
              WebAssembly in it — construction, ALG 4&rsquo;s neighbour heuristic,
              the layer descent, and a brute-force scan kept for grading.{" "}
              <Code>quant.rs</Code> is the on-the-wire vector format.{" "}
              <Code>lib.rs</Code> is nothing but marshalling across the JS
              boundary, plus the introspection API this page renders. The Rust
              test suite asserts recall against ground truth rather than
              asserting that search returned ten things.
            </p>
            <p>
              The rest of how this site is put together — including why every
              colour on this page is a token and what fails the build — is in the{" "}
              <Link href="/colophon">colophon</Link>. Other things you can run
              are in the <Link href="/lab">lab</Link>.
            </p>
          </div>
        </LabSection>
      </Container>
    </article>
  );
}
