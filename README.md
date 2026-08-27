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
  crawlers, so the Phaser board is an enhancement over server-rendered HTML —
  never a replacement for it.
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

## Build gates

| Command | What it enforces |
|---|---|
| `npm run typecheck` | Strict TS. Runs `next typegen` first — without it, route types lag behind new routes. |
| `npm run lint` | ESLint, including React correctness rules. |
| `npm run check:contrast` | WCAG AA across **both** themes, plus parity between the two dark-theme blocks. Parses the real stylesheet rather than a copy of the palette — a duplicated palette drifts and then certifies a theme nobody ships. |
| `npm run check:content` | Every MDX file against the corpus schema; flags leftover `TODO`/`CONFIRM` placeholders; catches corpus-level bugs a per-file schema cannot see (duplicate `pinOrder`, `finished` before `started`). |
| `npm run check:links` | Every internal href resolves — including template-literal prefixes, so a typo like `/project/${slug}` is caught rather than silently killing every project link. |
| `npm run check:bundle` | Critical JS on first paint, read from the build manifests. Next 16 removed `First Load JS` from build output, so this cannot be scraped from the log. |
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
build-time syntax highlighting (zero runtime highlighter JS) · Phaser for the
interactive board · Rust and C++ compiled to WebAssembly for search and inference.

## What I'd do differently

To be written honestly once there is enough hindsight to be worth reading. The
projects on this site each have that section; this one will earn its own.
