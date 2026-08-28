# Where we left off

Repo state: **all seven gates green, build clean, tree fully committed.**
A clean `git clone` + `npm ci` + `npm run build` was verified end to end during
the deploy-readiness pass (see `DEPLOY.md`) — no Rust toolchain, no
`wasm-pack`, and no model download are needed for a normal build, because the
WASM binary and the search index are committed. The embedding model is not
(see below).

```
npm run check     # typecheck, lint, contrast, content, links, search, bundle
npm run dev       # http://localhost:3000
```

## Done

- **Design system** — white / slate / teal, Helvetica Neue, **zero web fonts**
  (nothing is downloaded; ~90KB off the critical path and no swap-induced layout
  shift). Light-first with a chosen dark counterpart. 62 contrast + separation
  assertions gated in CI.
- **The Bench** — the projects as a printed circuit board. Progressive
  enhancement, verified both ways: no JS renders a clean card grid, JS layers a
  hand-written Canvas2D board with chip packages, pin legs, silkscreen, mounting
  holes and routed copper traces. **Phaser was removed entirely** — 1.15 MB
  (312 KB gzip) of game framework replaced by ~670 lines drawing the same shapes.
- **Content corpus** — 11 projects + 1 post, Zod-validated at build.
- **Pages** — home, projects (server-rendered filtering, zero client JS),
  project detail, writing, résumé, colophon, lab, 404.
- **Résumé** — two variants from the same corpus, prints to **exactly one page**,
  and shows every unverified field as a visible marker rather than a guess.
- **OG images** for home, every project, every post.
- **Client-side semantic search** — shipped, not in flight. An HNSW index
  hand-written in Rust, compiled to WebAssembly (43,175 bytes raw / 18,381
  gzip), with 10 Rust tests including a recall@10 ≥ 0.90 check against a
  brute-force scan. Two-stage by design: BM25 over a committed lexical index
  answers the first keystroke, and a quantised MiniLM plus the HNSW graph
  re-rank semantically once a visitor explicitly opts in (the model is ~22 MB,
  so it is never fetched silently). The ⌘K palette is mounted globally in the
  root layout and states which stage produced the list on screen — including
  an honest "semantic unavailable" with the real reason when the model isn't
  present. `npm run check:search` runs the shipped scorer against the shipped
  index in CI on every push. Full writeup in `README.md`'s Search section.

## Next up

1. **Deploy to Vercel and point `tadiwa.org` at it.** `SITE.url` in
   `src/lib/site.ts` is already `https://tadiwa.org` — that part needs no
   change. What's left is the actual hosting + DNS action; `DEPLOY.md` is the
   runbook for it, written this pass.
2. **Fill in `CONFIRM.md`** — 21 unverified fields, re-verified this pass and
   still open. Highest value by far: **project status**. `k20-curation` and
   `dsp-audio-denoising` are `shipped`; everything else is `planned`, and the
   résumé deliberately excludes `planned` work ("Built X" is false for
   something unstarted). Promoting whatever is genuinely underway to
   `building` is still the fastest way to make the résumé show more than two
   projects.
3. **The deployed-semantic decision needs revisiting if priorities change.**
   `public/models/` (~22 MB, the quantised embedding weights) is gitignored
   and not produced by the default Vercel build, so a deploy today ships
   lexical-only search — the palette degrades to this honestly (see `DEPLOY.md`
   for the reasoning and the options that were rejected: running
   `build:search`/`build:model` at Vercel build time, or committing the model
   via Git LFS).
4. **Bug found in the model pipeline, not fixed here (out of this pass's file
   ownership — `scripts/**`).** `scripts/build-embeddings.ts` loads the
   embedding pipeline with `dtype: "fp32"`, which only downloads
   `onnx/model.onnx` into the transformers cache — it never touches
   `onnx/model_quantized.onnx`. `scripts/copy-model.sh` (`npm run build:model`)
   expects the quantized file and fails with "No such file or directory" on a
   clean checkout, even after `npm run build:search` has just run, exactly as
   its own comment says it shouldn't. Reproduced from a clean clone: the
   quantized file only appears if something else separately loads the
   pipeline with `dtype: "q8"`. Fix is one of: have `build-embeddings.ts` warm
   both dtypes, or have `copy-model.sh` do its own `dtype: "q8"` load before
   copying, or document the manual warm-up step. Whoever owns `scripts/**`
   next should pick one.
5. **Cosmetic:** `build-embeddings.ts`'s console summary computes the
   `chunks.json` size from the untruncated in-memory array, not the truncated
   payload it actually writes — it prints ~41.9 KB when the file on disk is
   34.6 KB. Harmless (the written file is correct), but worth a one-line fix
   next time that script is touched.
6. **`/lab` still lists search as `status: "building"` (ETA September 2026)**
   even though it has shipped as the site-wide ⌘K palette. Whoever owns
   `src/app/lab/**` should either flip its status to shipped/link it at the
   live feature, or split "the Lab demo" from "the site-wide palette" as
   deliberately different things — right now the page contradicts the rest of
   the site.
7. Week 5 of the plan: `tadiwa-nano` — the hand-written C++ transformer forward
   pass compiled to WASM for `/lab/inference`.

## Notes

- **Headless Chrome on this machine is unreliable.** `timeout` does not exist;
  `--virtual-time-budget` hangs on any page with a rAF loop; Chrome often will
  not exit (launch with `&`, poll for the output file, then `pkill`); and macOS
  clamps the minimum window width to ~500px, so `--window-size=390` silently
  renders wider and crops — test mobile inside a fixed-width `<iframe>` instead.
  `scripts/cdp.mjs` documents and works around all of this; prefer it over
  `--screenshot`, which fires at `load` and misses anything dynamically
  imported (the palette, the WASM, the model).
- CI's named steps (`.github/workflows/ci.yml`) run typecheck, lint, contrast,
  content, search, build, bundle, and Lighthouse — but not `check:links` as
  its own step, even though it's part of the local `npm run check` aggregate.
  Worth reconciling the two lists so "everything CI runs" and "everything
  `check` runs" mean the same thing.
