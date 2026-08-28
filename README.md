# tadiwa.org

Personal site and portfolio. A statically-rendered Next.js app whose navigation is a
circuit board you probe, and whose AI features run on inference code compiled from
source in this repo rather than on somebody's API.

## Why this exists / what's hard

A portfolio is read in about thirty seconds by someone who has already seen two
hundred of them this week. The generic version — a template, three CRUD apps, and a
"chat with my résumé" box wired to an API — is worth roughly nothing now that
anyone can generate one in an afternoon.

So the constraints here are deliberately awkward:

- **The AI has to be infrastructure I wrote**, not an API I called. A vector index
  and a transformer forward pass, compiled to WebAssembly, executing in the
  visitor's browser.
- **The interactive layer has to be real** without making the site invisible.
  Canvas content cannot be read by screen readers, ATS parsers, or search
  crawlers, so the hand-drawn Canvas2D board is an enhancement over
  server-rendered HTML — never a replacement for it.
- **Correctness has to be enforced, not claimed.** Accessibility, content
  integrity, and performance are build gates. A site that argues for rigour and
  ships a 3:1 contrast failure is arguing against itself.

## Architecture

One typed corpus in `content/` feeds four consumers, which is why the schema is
strict rather than convenient:

```
content/*.mdx ──▶ Zod schema ──┬──▶ /projects/[slug]   full writeups
  (frontmatter)  (schema.ts)   ├──▶ vector search      chunked + embedded at build
                               ├──▶ /tailor            the only facts the model may assert
                               └──▶ /resume            selects pre-written bullets
```

The third consumer is the reason for the strictness. A model asked to *write about*
a project will invent numbers. A model asked to *select from* pre-vetted bullets
cannot. Every benchmark requires `hardware`, `methodology`, and a `gapAnalysis`
paragraph; every design decision requires the alternative that was `rejected`.

## Search

⌘K opens a two-stage search, mounted globally in the root layout. The first
keystroke is answered by BM25 over a small inverted index — already loaded,
synchronous, no network round-trip. Only on an explicit click does the second
stage load: a quantised sentence-transformer embeds the query in the browser
and an HNSW graph I wrote in Rust re-ranks it. The UI states which stage
answered the list on screen, and if the semantic stage cannot come up — no
model on the deployment, a blocked fetch, whatever — the palette says so
rather than quietly serving lexical results under a "semantic" label.

- **Index** — `crates/hnsw`, Rust compiled to WebAssembly with `wasm-pack`.
  43,175 bytes raw, 18,381 gzip. 10 tests (`npm run test:rust`), including a
  recall@10 ≥ 0.90 assertion against a brute-force scan of the same vectors.
- **Corpus** — 99 chunks built from the same `content/` that feeds the pages.
  `public/search/chunks.json` (34.6 KB), `lexical.json` (41.3 KB), and the
  int8-quantised `vectors.bin` (37.5 KB) are produced by `npm run build:search`
  and committed, so a normal clone and build need no model download.
- **Model** — `Xenova/all-MiniLM-L6-v2`, quantised to int8, ~22 MB, fetched
  same-origin only and only after that click. It is **not** committed — see
  `DEPLOY.md` for what that means for a deployed build and why.

`npm run check:search` runs the shipped BM25 scorer against the shipped index
on eleven real queries every CI run. It exists because the tokenizer is
implemented twice — once to build the index, once to score a query — and a
drift between the two would fail silently: no error, just a search box that
stops finding things that are demonstrably in the corpus.

## Inference

`/lab/inference` runs a transformer forward pass written by hand in C++ and
compiled to WebAssembly — no ML framework, no BLAS, no server call. It generates
in the visitor's tab from a small model trained on this repository's own prose.

- **Engine** — `engines/nano`, 782 lines of C++ built with `em++ -O3 -msimd128`.
  28,028 bytes of wasm, 12,554 gzip. A self-describing weights format, an int8
  loader, a pre-LN decoder with a KV cache, byte-level tokenisation, and
  temperature/top-p sampling. Generation is stepped one token at a time from
  JavaScript, because a loop inside wasm would block the main thread for the
  whole completion — no streaming and no stop button.
- **Parity** — the only claim worth making about an engine is that it computes
  what the reference computes. `npm run test:nano:parity` replays a fixed prompt
  through the C++, KV cache included, and diffs the final logits against the
  PyTorch model the weights were exported from. fp32 agrees to **7.6e-06**;
  int8 diverges by **0.24** in the worst logit and still selects the same token.
  That gap is the quantisation trade, stated as a measurement.
- **Kernels** — `npm run test:nano` checks each op against golden fixtures
  generated by a numpy oracle. The fixtures are data, not a reference
  implementation.

The model is deliberately unimpressive and the page says so: 359K parameters on
66 KB of prose gives train loss 1.19 against validation 1.94, which is
memorisation. The matmul is a cache-aware triple loop with the whole
optimisation ladder unclimbed. int8 saves download, **not** memory — the weights
dequantise on load, and claiming otherwise would be the easiest lie available.

## Build gates

| Command | What it enforces |
|---|---|
| `npm run typecheck` | Strict TS. Runs `next typegen` first — without it, route types lag behind new routes. |
| `npm run lint` | ESLint, including React correctness rules. |
| `npm run check:contrast` | WCAG AA across **both** themes, plus parity between the two dark-theme blocks. Parses the real stylesheet rather than a copy of the palette — a duplicated palette drifts and then certifies a theme nobody ships. |
| `npm run check:content` | Every MDX file against the corpus schema; flags leftover `TODO`/`CONFIRM` placeholders; catches corpus-level bugs a per-file schema cannot see (duplicate `pinOrder`, `finished` before `started`). |
| `npm run check:links` | Every internal href resolves — including template-literal prefixes, so a typo like `/project/${slug}` is caught rather than silently killing every project link. |
| `npm run check:search` | The shipped lexical scorer against the shipped index, on real queries. Guards against the build-time and runtime tokenizers drifting apart. Needs no model download — the index it checks is already committed. |
| `npm run check:bundle` | Critical JS on first paint, read from the build manifests. Next 16 removed `First Load JS` from build output, so this cannot be scraped from the log. |
| `npm run test:nano` | Each inference kernel against golden fixtures. Reports "stub" for unstarted work, so an unfinished engine reads as unfinished rather than broken. |
| `npm run test:nano:parity` | End-to-end logit agreement with PyTorch, fp32 and int8. Catches the class of bug the op tests cannot — a transposed weight, a mis-sliced head, an off-by-one in the KV cache. Needs no Python; the reference logits are committed. |
| `npm run check` | All of the above. |
| `npm run build` | Production build. |

Lighthouse CI runs in the workflow on five routes, asserting performance, LCP,
CLS, and an accessibility score of 100.

The contrast gate caught three real failures on its first run, including a
`--border-strong` at 1.88:1 that would have shipped on form-input borders.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # everything CI runs, minus the build
```

Node 20.9+ required (Next 16 minimum). Content lives in `content/`; the schema that
governs it is `src/lib/content/schema.ts`.

## Stack

Next.js 16 (App Router, RSC, Turbopack) · TypeScript · Tailwind CSS v4 with a
CSS-custom-property token layer · MDX validated by Zod at build · Shiki for
build-time syntax highlighting (zero runtime highlighter JS) · hand-written
Canvas2D for the interactive board (Phaser was removed — see `NEXT.md`) ·
Rust compiled to WebAssembly for the HNSW search index, with the query
embedding model running through ONNX Runtime Web.

## What I'd do differently

- **The contrast gate should have existed before the palette did.** It was
  written after, and immediately found three real failures in colours I had
  already looked at and approved — including a form-input border at 1.88:1.
  Every one of them shipped for a while.
- **Two tokenizers is one too many.** The search index's tokeniser is
  implemented twice, once to build and once to query, and a drift between them
  would break search silently. `check:search` exists to catch that, but the
  better fix is one implementation compiled to both places.
- **The nano weights are committed** (1.8 MB) because regenerating them needs
  PyTorch. That is the right call for deploy reliability and the wrong shape
  long-term; the honest version is a release artefact, not a repo file.
- **Screenshots are not verification.** `--screenshot` and `--dump-dom` both
  fire at the load event, so both reported the command palette missing when it
  was simply not mounted yet. That cost real time before `scripts/cdp.mjs`
  existed.
