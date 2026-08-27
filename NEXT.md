# Where we left off

Repo state: **all six gates green, build clean.**

```
npm run check     # typecheck, lint, contrast, content, links, bundle
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

## In flight

An agent is building **client-side semantic search**: an HNSW index written in
Rust and compiled to WebAssembly, with build-time embeddings and a ⌘K palette.
Two-stage by design — instant lexical results on the first keystroke, then a
semantic re-rank once a quantised embedding model lazily streams in, with the UI
showing honestly which mode it is in.

## Next up

1. Fill in `CONFIRM.md` — 22 unverified fields. Highest value by far: **project
   status**. Everything except K20 and the DSP coursework is `planned`, and the
   résumé deliberately excludes `planned` work ("Built X" is false for something
   unstarted), so it currently shows only two projects. Promoting whatever is
   genuinely underway to `building` fixes that immediately.
2. Deploy to Vercel, point `tadiwa.org` at it, set `SITE.url`.
3. Week 5 of the plan: `tadiwa-nano` — the hand-written C++ transformer forward
   pass compiled to WASM for `/lab/inference`.

## Notes

- Nothing is committed yet. The tree is entirely untracked/modified.
- `node_modules/phaser` may still be on disk though nothing imports it; a clean
  `npm ci` clears it.
- **Headless Chrome on this machine is unreliable.** `timeout` does not exist;
  `--virtual-time-budget` hangs on any page with a rAF loop; Chrome often will
  not exit (launch with `&`, poll for the output file, then `pkill`); and macOS
  clamps the minimum window width to ~500px, so `--window-size=390` silently
  renders wider and crops — test mobile inside a fixed-width `<iframe>` instead.
