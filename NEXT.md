# Where we left off

Repo state: **every gate green, build clean, tree fully committed.**
A clean `git clone` + `npm ci` + `npm run build` was verified end to end during
the deploy-readiness pass (see `DEPLOY.md`). No Rust toolchain, no
`wasm-pack`, and no model download are needed for a normal build, because the
WASM binary and the search index are committed. The embedding model is not
(see below).

```
npm run check     # typecheck, lint, contrast, content, links, search, bundle
npm run dev       # http://localhost:3000
```

## Done

- **Design system**, white / slate / teal. Saira sets headings (one variable
  file, 32.5 KB, measured on the production build); body and mono stay on the
  system stack, so the two faces a reader spends the most time in cost nothing
  and nothing reflows on swap. Light-first with a chosen dark counterpart.
  62 contrast + separation assertions gated in CI.
- **The Bench**, the projects as a printed circuit board. Progressive
  enhancement, verified both ways: no JS renders a clean card grid, JS layers a
  hand-written Canvas2D board with chip packages, pin legs, silkscreen, mounting
  holes and routed copper traces. **Phaser was removed entirely**: 1.15 MB
  (312 KB gzip) of game framework replaced by ~670 lines drawing the same shapes.
- **Content corpus**, 11 projects + 1 post, Zod-validated at build.
- **Pages**, home, projects (server-rendered filtering, zero client JS),
  project detail, writing, résumé, colophon, lab, 404.
- **Résumé**, two variants from the same corpus, prints to **exactly one page**,
  and shows every unverified field as a visible marker rather than a guess.
- **OG images** for home, every project, every post.
- **Client-side semantic search**, shipped, not in flight. An HNSW index
  hand-written in Rust, compiled to WebAssembly (43,175 bytes raw / 18,381
  gzip), with 10 Rust tests including a recall@10 ≥ 0.90 check against a
  brute-force scan. Two-stage by design: BM25 over a committed lexical index
  answers the first keystroke, and a quantised MiniLM plus the HNSW graph
  re-rank semantically once a visitor explicitly opts in (the model is ~22 MB,
  so it is never fetched silently). The ⌘K palette is mounted globally in the
  root layout and states which stage produced the list on screen, including
  an honest "semantic unavailable" with the real reason when the model isn't
  present. `npm run check:search` runs the shipped scorer against the shipped
  index in CI on every push. Full writeup in `README.md`'s Search section.
- **Inference engine**, `/lab/inference` runs SmolLM2-135M-Instruct in the
  visitor's tab from a hand-written C++ forward pass compiled to WebAssembly
  (80,275 bytes raw / 34,827 gzip): RMSNorm, RoPE, grouped-query attention,
  SwiGLU, tied embeddings, a KV cache, byte-level BPE matching HuggingFace
  10/10, and a weight-only int8 matmul that keeps the weights packed. Measured
  in Chrome through the real UI: 40-token prefill in 1339 ms, then 25.1 tok/s,
  174 MB resident. Logit parity against PyTorch is fp32 4.101e-05 / int8
  8.086e-01 with matching argmax, and the ten ops each match a numpy oracle.
  The 359K model trained on this site's prose is kept in the selector because
  the comparison is the content.

## Next up

Everything below is blocked on you, not on more building.

1. **Fill in `CONFIRM.md`**, 22 unverified fields. Run `npm run dev` and open
   `/admin`; it lists every placeholder with the offending line quoted inline.
   The highest-value item by a distance is **project status**: everything except
   K20 and the DSP coursework is `planned`, and the résumé deliberately excludes
   planned work ("Built X" is false for something unstarted), so it currently
   shows two projects. One sentence about what is genuinely underway fixes that.
2. **Host the SmolLM2 weights, then push and deploy.** `DEPLOY.md` covers
   Vercel settings, DNS, `SITE.url`, and the two decisions with real
   consequences, both of which are the same shape: a large model file that is
   not in the repo, and a page that degrades honestly without it.
   - Semantic search is lexical-only unless the 22 MB embedding model is
     shipped (§6).
   - **`/lab/inference` shows only the 359K model** unless the 129 MB
     `smollm-int8.bin` is served (§5b). It is gitignored because it is over
     GitHub's 100 MiB per-file limit. Put it on R2 / Vercel Blob / a GitHub
     Release and set `NEXT_PUBLIC_NANO_WEIGHTS_BASE`. This is the one that
     matters most: it is the demo the lab page leads with, and without it the
     flagship feature is the deliberately-bad model.
   - The small model's weights and the WASM binary *are* committed, so a normal
     build still needs no Rust, no Emscripten and no PyTorch.
3. **Rewrite `engines/nano/src/ops.cpp` from the header contracts.** The kernels
   there are not yours. The comments explain every choice, two-pass variance to
   avoid catastrophic cancellation, `i-k-j` loop order for cache locality,
   masking by never computing the future, but reading an explanation is not
   deriving it, and an interviewer will pick exactly that file. `npm run
   test:nano` is the check; it is a weekend, and it converts the engine from
   something you can describe into something you own.
4. **Then climb the ladder.** Blocking, SIMD, and an int8 matmul that skips
   dequantisation, each measured into a PERFORMANCE.md. That is the part that
   maps onto the CUDA work.

## Notes

- **Headless Chrome on this machine is unreliable.** `timeout` does not exist;
  `--virtual-time-budget` hangs on any page with a rAF loop; Chrome often will
  not exit (launch with `&`, poll for the output file, then `pkill`); and macOS
  clamps the minimum window width to ~500px, so `--window-size=390` silently
  renders wider and crops, test mobile inside a fixed-width `<iframe>` instead.
  `scripts/cdp.mjs` documents and works around all of this; prefer it over
  `--screenshot`, which fires at `load` and misses anything dynamically
  imported (the palette, the WASM, the model).
- **CI and `npm run check` do not run the same set.** CI runs typecheck, lint,
  contrast, content, search, admin, the three nano gates, build, bundle and
  Lighthouse. It does **not** run `check:links` (which `npm run check` does) or
  `test:rust` (which neither does, though the HNSW crate has 10 tests including
  the recall assertion). Reconciling the two lists is small and worth doing, so
  that "everything CI runs" and "everything `check` runs" mean the same thing.
