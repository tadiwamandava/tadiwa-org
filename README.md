# tadiwa.org

Personal site. Next.js, statically rendered, with a circuit board for navigation
and AI features that run on inference code compiled from this repo rather than
on somebody's API.

## Quick start

```bash
npm install
npm run dev      # localhost:3000
npm run check    # everything CI runs except the build
```

Node 20.9+ (Next 16's floor). Content lives in `content/`, governed by
`src/lib/content/schema.ts`.

## The rule

The AI has to be infrastructure I wrote, not an API I called. That is the only
constraint here that costs anything, and it is why the two demos below run in
the visitor's tab instead of behind a key.

The interactive board is an enhancement, never a replacement: canvas content is
invisible to screen readers, ATS parsers and crawlers, so server-rendered HTML
carries the same information underneath it.

## What runs in the browser

**A transformer forward pass, by hand in C++.** `engines/nano/` compiles to
WebAssembly and runs SmolLM2-135M at about 25 tokens a second: RMSNorm, RoPE,
grouped-query attention, SwiGLU, a KV cache, an int8 matmul and the sampler. The
weights are Hugging Face's and the page says so. `/lab/inference` carries the
logit-parity numbers against PyTorch, which is the part that proves it is
correct rather than merely running.

It answers from retrieved passages and declines when they do not cover the
question. Declining is a learned habit rather than a stored fact, so that part
is a LoRA: 4.9M trainable parameters on 122 examples from this corpus.

**An HNSW index, by hand in Rust.** `crates/hnsw/` compiles to 43 KB of
WebAssembly and searches the site client-side. `/lab/search` draws the layer
structure and measures recall against a brute-force scan while you watch,
including the part where the graph loses: at this corpus size it saves no time.

**Local speech.** whisper-tiny.en runs in the tab for voice input. Nothing is
uploaded.

## The corpus

One typed corpus feeds three consumers, which is why the schema is strict:

```
content/*.mdx ──▶ Zod schema ──┬──▶ /projects/[slug]   the writeups
                               ├──▶ vector search      chunked and embedded at build
                               └──▶ /resume            selects pre-written bullets
```

`/resume` selects from `resumeBullets` rather than writing prose, so it cannot
invent a number. Every benchmark requires `hardware`, `methodology` and a
`gapAnalysis`; every decision requires the alternative that was `rejected`.

## Gates

`npm run check` runs eight, and CI fails on any of them: WCAG AA contrast in
both directions, corpus schema validity, internal links, search expectations,
prompt-format drift between the TypeScript and Python that share it, the admin
auth properties, a corpus round-trip, and a gzip budget on the critical path.

Each was written to fail before it was trusted. The contrast gate found three
real failures in colours I had already approved, including a 1.88:1 input
border.

## Deploying

See `DEPLOY.md`. Short version: a Dockerfile, Coolify, and one build arg for the
129 MB weights file that is too large for git.

## Stack

Next.js 16 · TypeScript · Tailwind v4 over CSS custom properties · MDX validated
by Zod · Shiki at build time · hand-written Canvas2D · Rust and C++ to
WebAssembly · ONNX Runtime Web for the query embedding.

## What I'd do differently

- **The contrast gate should have predated the palette.** Writing it after meant
  shipping failures I had looked at and approved.
- **Two tokenizers is one too many.** The search tokeniser exists twice, once to
  build and once to query. Drift between them breaks search silently;
  `check:search` catches it, but one implementation compiled to both places is
  the real fix.
- **Model weights are release artefacts, not repo files.** Committing SmolLM2's
  129 MB was simply wrong: it is over GitHub's per-file limit, so it could not
  be pushed, and removing it cost a history rewrite.
