# Deploying tadiwa.org

Written for whoever does this next, possibly future me, with no memory of
any of it. Everything below was verified against the actual repo, not
inferred from the config files.

---

## 1. Prerequisites

- Node.js **≥ 20.9** locally, to match what Next.js 16 itself requires
  (`node_modules/next/package.json` declares `"engines": {"node": ">=20.9.0"}`
, an older Node fails the build outright, not just a warning).
- A Vercel account with the repo's GitHub remote connected (or the Vercel CLI,
  if deploying without Git integration).
- Nothing else. No Rust toolchain, no `wasm-pack`, no Python. Those are only
  needed to *regenerate* the search index (`npm run build:wasm` /
  `build:search`), the artefacts they produce are already committed (see §6).

You do **not** need to run `npm run build:index` (or any of its three parts)
before deploying. That is the biggest thing to know about this repo's build,
and it's easy to assume otherwise given how much tooling exists around it.

## 2. What a clean checkout actually needs, verified

This was tested for real, not just read off the config: clone the repo into a
scratch directory, `npm ci`, `npm run build`, nothing else.

```
git clone <repo> /tmp/scratch/tadiwa-org
cd /tmp/scratch/tadiwa-org
npm ci            # ~10s, 862 packages, no warnings that matter
npm run build     # ~8s wall, next build via Turbopack, exits 0
```

That succeeds with **no Rust, no `wasm-pack`, and no model download**,
because two of the three generated artefacts are committed to the repo:

| Command | Produces | Committed? | Needed for `npm run build`? |
|---|---|---|---|
| `npm run build:wasm` | `public/search/hnsw_bg.wasm`, `src/lib/search/hnsw-glue.js` | **yes** | No, already in the tree |
| `npm run build:search` | `public/search/{chunks,lexical}.json`, `vectors.bin` | **yes** | No, already in the tree |
| `npm run build:model` | `public/models/all-MiniLM-L6-v2/**` (~22 MB) | **no, gitignored** | No, the app degrades gracefully without it (§6) |
| `npm run build:voice` + `build:model` | `public/models/whisper-tiny.en/**` (~42 MB) | **no, gitignored** | No, the microphone button hides itself when the model is absent |
| `tools/convert_smollm.py` | `public/nano/smollm-int8.bin` (129 MB) | **no, over GitHub's file limit** | No, the app degrades gracefully without it (§5b) |

Two things this means in practice, both deliberate and both visible in the UI
rather than silent: **a deployed build ships lexical search only** (§6), and
**the SmolLM2 demo is unavailable unless its weights are hosted** (§5b). The
second one is worth fixing before showing the site to anybody; it is the
demo the lab page leads with.

## 3. Vercel project settings

Next.js on Vercel is zero-config for this app. Import the repo and leave the
defaults alone:

| Setting | Value | Notes |
|---|---|---|
| Framework Preset | **Next.js** | Auto-detected from `package.json`. |
| Build Command | *(default)* `next build` | Matches the `build` script exactly. Do not override. |
| Output Directory | *(default, managed)* | Vercel's Next.js adapter manages this itself; there is nothing to set. |
| Install Command | *(default)* `npm ci` | `package-lock.json` is committed, so Vercel uses `npm ci` automatically. |
| Node.js Version | **22.x** (or any version Vercel offers that's ≥ 20.9) | `package.json` has no `engines.node` field pinning this, so it falls back to whatever Vercel's platform default is at deploy time. Pin it explicitly in Project Settings → General so a future Vercel default change can't silently drop below the Next 16 floor. CI (`.github/workflows/ci.yml`) uses Node 22, match it. |

Nothing in this repo needs a `vercel.json`. See §7 for why one wasn't added.

## 4. Environment variables

**None are required.** One is worth setting.

`NEXT_PUBLIC_NANO_WEIGHTS_BASE`, a directory URL for the SmolLM2 weights,
defaulting to `/nano` (same-origin). Set it when the 129 MB weights file is
hosted somewhere other than this deployment, which it usually has to be; §5b
covers the options and what the page does when it is unset and the file is
absent. Public by construction: it is a URL the browser fetches, not a secret.

The only other `process.env` reads anywhere in `src/` or `scripts/` are both
`process.env.NODE_ENV`, Vercel sets this automatically (`production` for a
deploy, never `development`), so neither needs a value you set:

- `src/lib/content/index.ts`, hides draft posts outside development.
- `src/lib/admin/guard.ts`, gates the entire `/admin` content editor. With no
  admin secrets set, `/admin` 404s and every one of its Server Actions throws
  before touching disk, on every deployment, with no configuration needed to
  make that true. Setting the two secrets in §4b turns on a password login
  instead. **Read §4b before you do that**, because on Vercel the editor will
  authenticate correctly and then fail to save.

### 4b. Admin login, and why it does not work on Vercel

`ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` turn `/admin` into a
password-protected editor. Generate both with:

```bash
npm run admin:hash        # prompts, echo off, prints the hash and a secret
```

The password itself is never written anywhere: not to a file, not to argv
where `ps` would show it, not to shell history, not to the output. Only the
scrypt hash is printed. Both variables are required and neither has a default,
so a half-configured deployment leaves the admin **off**, not open.

Three modes, decided entirely by configuration:

| Secrets set | Environment | `/admin` |
|---|---|---|
| no | `next dev` | open, no password (unchanged from before) |
| no | production | **404** — this is the default |
| yes | either | password login, 8-hour session |

**The catch, and it is a real one.** The editor writes MDX files into
`content/`. On Vercel the filesystem is read-only outside `/tmp`, and a
serverless instance is discarded after the request, so a save would fail, and
if it did not the file would vanish. Authentication is not what is missing
there; a persistence layer is. A deployed editor needs writes to go somewhere
that survives, which means a commit through the GitHub API, a database, or
object storage, and `ContentStore` in `src/lib/admin/store.ts` is the seam that
change goes behind.

So the login is worth setting **only** where the filesystem is genuinely
writable and durable: a VPS, a container with a mounted volume, a local machine
reachable over a tunnel. On Vercel, leave both unset and keep editing through
`npm run dev`, which is also the workflow that produces a commit.

Session details, since this guards a route that writes files: the cookie is
`httpOnly`, `sameSite=strict`, `secure` in production, and scoped to `/admin`
so it is not attached to any other request. The token is an HMAC-SHA256
signature over an expiry and a nonce, and the expiry is checked **after** the
signature so a holder cannot extend their own session. `npm run check:auth`
asserts all of that, including that a tampered expiry is rejected.

`OPENROUTER_API_KEY`, **optional, and the only secret in this repo.** Enables
the hosted comparison on `/lab/inference`: the same grounded question sent to
Kimi K3 (2.8T parameters), rendered beside the local model's answer. Leave it
unset and the feature reports itself unavailable; everything else on the page
is untouched, because nothing else ever needed a key.

Set it only when you want that comparison live, and understand what it costs:

- **The provider's spend cap is the only bound that actually holds.** The route
  rate-limits per IP (5/minute) and caps `max_tokens`, but Vercel functions do
  not share memory, so a burst spread across cold starts gets more than that.
  Set a hard monthly limit in the OpenRouter dashboard. Treat the in-process
  limiter as a speed bump, not a budget.
- The endpoint cannot be used as a general-purpose proxy. The client sends only
  a question, truncated to 300 characters; the server does its own retrieval
  over the committed corpus and builds the prompt itself. Nobody can post
  arbitrary text through it to a paid API.
- `COMPARE_MODEL` overrides the model id (default `moonshotai/kimi-k3`).

Other than that there is no database URL and no analytics token, the "why this
exists" pitch in `README.md` ("infrastructure I wrote, not an API I called")
is still literally true of everything that runs the site itself. The hosted
comparison is the one deliberate exception, and the page says so where a
visitor can see it rather than here.

If a future feature needs a secret (the `/tailor` consumer sketched in
`README.md`'s architecture diagram is the likely candidate, if it ever calls
an external model instead of writing pure client-side logic), add it here
when it lands.

## 5. DNS for tadiwa.org

Vercel will show the exact records to add on the domain's Settings →
Domains page once `tadiwa.org` is added to the project, **use whatever it
shows you over what's written here**, since the specific anycast IP and CNAME
target Vercel issues can change. As of this writing, the two common paths are:

- **Delegate the domain to Vercel's nameservers** (simplest, Vercel manages
  every record, including automatic HTTPS renewal). Point the registrar's NS
  records at the ones Vercel's dashboard lists.
- **Keep the existing registrar/DNS provider** and add records manually:
  an `A` record for the apex (`tadiwa.org`) pointing at Vercel's anycast IP,
  plus a `CNAME` for `www` pointing at the target Vercel's dashboard gives
  you (commonly `cname.vercel-dns.com`, but confirm; Vercel has used
  per-project CNAME targets before). Decide whether `www.tadiwa.org` redirects
  to the apex or the reverse, and set that as the project's primary domain in
  Vercel so the other is a redirect, not a duplicate origin.

Either way, **`SITE.url` (§8 below) must exactly match the domain that ends
up serving traffic**, same scheme, same host, no trailing slash.

## 5b. The inference engine

`/lab/inference` runs two models through the same WebAssembly engine, and they
have opposite deployment stories.

| Path | Size | Committed? | Produced by |
|---|---|---|---|
| `public/nano/nano.{mjs,wasm}` | 97 KB | **yes** | `npm run build:nano` (needs `emcc`) |
| `public/nano/nano-int8.bin` | 400 KB | **yes** | `npm run build:fixtures` → trainer |
| `public/nano/nano-fp32.bin` | 1.4 MB | **yes** | same |
| `public/nano/smollm-tokenizer.bin` | 994 KB | **yes** | `tools/export_tokenizer.py` |
| `public/nano/smollm-meta.json` | 243 B | **yes** | `tools/convert_smollm.py` |
| `public/nano/smollm-int8.bin` | **129 MB** | **no** | `tools/convert_smollm.py` |
| `public/nano/smollm-fp32.bin` | 513 MB | no | same (local parity checks only) |

The small model deploys itself. **SmolLM2 does not, and cannot**: at 129 MB it
is over GitHub's 100 MiB per-file limit, so a push carrying it is rejected
outright.

### What happens if you deploy without it

The page degrades on purpose rather than breaking. `getSmolInfo()` stats the
file at render time; when it is absent and no external origin is configured,
the SmolLM2 entry in the model selector is disabled and labelled *"not served
by this deployment"*, and the demo falls back to the 359K model. No 404, no
button that does nothing. This is the same rule the semantic-search stage
follows in §6.

It also means the flagship demo is the weak one, so this is worth fixing.

### Serving the weights

Set `NEXT_PUBLIC_NANO_WEIGHTS_BASE` to a directory URL holding
`smollm-int8.bin` and `smollm-tokenizer.bin`. It defaults to `/nano`
(same-origin). The value is inlined at build time and is a public URL, not a
secret. Three ways to get one:

1. **Cloudflare R2**, recommended. No egress fees, which matters when the
   asset is 129 MB and one curious visitor costs 129 MB of it. Attach a custom
   domain (`weights.tadiwa.org`) and set the variable to that. R2 needs a CORS
   rule allowing `GET` from the site's origin, or the browser fetch fails with
   an opaque network error rather than a status code.
2. **Vercel Blob**, least setup if the site is already on Vercel. `vercel blob
   put public/nano/smollm-int8.bin` returns a public URL; check the free
   tier's bandwidth allowance against the 129 MB figure before relying on it.
3. **A GitHub Release asset**, zero new accounts. Releases allow files up to
   2 GB, and the download URL sends `Access-Control-Allow-Origin: *`. Slowest
   of the three and it 302-redirects, but it works and costs nothing.

The browser caches the file under `caches.open("nano-weights-v4")` after the
first successful load, so a returning visitor pays nothing. **Bump that cache
name in `src/components/nano/llama.ts` whenever the weights change.** A stale
hit on a re-quantised file is an unexplainable crash rather than a clean miss.

### Regenerating

- **`emcc`**, `brew install emscripten`. Pulls `python@3.14`, which will shadow
  the system `python3` on PATH. Anything of yours that depended on the old
  interpreter's packages breaks quietly; the fixture tooling pins its own venv
  for exactly this reason.
- **PyTorch**, conversion and training only, in `engines/nano/tools/.venv`.
  Inference is C++ and depends on none of it.
- `tools/convert_smollm.py` downloads SmolLM2 from Hugging Face and writes both
  the fp32 and int8 blobs. It **raises** rather than defaulting on
  `rope_theta`; see the README for why that line exists.

**If `/lab/inference` shows an error instead of generating**, check in this
order: `/nano/nano.wasm` returns 200; the weights URL returns 200 with a
`Content-Length` header (the loader reserves the heap from it, and a response
without one falls back to buffering); CORS if the weights are on another
origin; and the browser console for a WebAssembly instantiation failure, which
usually means the `.wasm` was served with the wrong MIME type.

## 6. The search index and the model, what to actually do

This is the one non-obvious decision in this deploy, so it gets its own
section instead of a table row.

**The situation.** Search is two-stage: an instant BM25 pass over a small,
committed lexical index, and an optional semantic pass that needs a ~22 MB
quantised sentence-transformer (`Xenova/all-MiniLM-L6-v2`, int8) running in
the visitor's browser. `public/models/`, where that model has to live to be
fetched same-origin, is gitignored (`.gitignore`: `/public/models/`), and
nothing in the default `npm run build` produces it. **Deployed as-is, the
site's search is lexical-only.** Full detail on the two-stage design is in
`README.md`'s Search section.

**The decision: leave it that way, deliberately, for now.** Three options
were weighed:

1. **Run `build:search` + `build:model` as part of the Vercel build.**
   Rejected, though note the blocker described in an earlier draft of this
   file has since been fixed. `scripts/build-embeddings.ts` used to load the
   pipeline with `dtype: "fp32"`, which downloads `onnx/model.onnx` and never
   `onnx/model_quantized.onnx`, the file `build:model` actually copies, so
   `build:model` failed from a clean cache. It now loads `q8`, which both
   fixes that and aligns document vectors with the query vectors the browser
   produces (they were previously embedded at different precisions). A cold
   build now pulls 22 MB instead of 90 MB.

   It is still rejected, on the remaining ground: it adds a ~22 MB Hugging
   Face download to *every* deploy, including a one-line copy edit. That turns
   an unrelated content fix into a build that can fail on an HF Hub hiccup,
   and spends build minutes on a feature most visitors never open.

2. **Commit the quantised model with Git LFS.** Rejected as disproportionate
   for what it buys. It needs `git lfs track` on `public/models/**`,
   un-ignoring that path (a `.gitignore` policy call that belongs with
   whoever owns `scripts/copy-model.sh`'s "gitignored, regenerated at build
   time" contract, not this pass), enabling Git LFS support in the Vercel
   project, and a GitHub LFS bandwidth quota (1 GB/month on the free tier) that
   a handful of redeploys during active work could burn through. At which
   point *every* deploy fails to pull the model until the quota resets,
   which is a worse failure mode than the one being solved.
3. **Leave deployed-semantic out of scope; make the UI honest about it.**
   **Chosen.** The palette already had the right error path built in, and
   that was verified rather than assumed (see below), so this costs nothing to
   implement and adds no fragility to the build. Lexical search is real
   search, not a placeholder: it's what the two-stage design itself calls
   "what almost every visitor will ever use," and it's what `npm run
   check:search` gates in CI on eleven real queries.

**Verified, not assumed.** Built the app from a clean clone with no
`public/models/`, started it, opened the palette, and clicked "enable
semantic search." The engine's `loadSemantic()` catches the failed model
fetch and the palette renders:

```
semantic unavailable
```
with the actual fetch failure in the element's `title` attribute:
```
`local_files_only=true` or `env.allowRemoteModels=false` and file was not
found locally at "/models/all-MiniLM-L6-v2/config.json".
```

That is the intended behavior, not a bug to fix before shipping. Nothing is
silently wrong; a visitor who inspects the control sees exactly why.

**If you want semantic search live on the deployed site later**, the manual
path is: fix the `dtype` issue above (or manually run a `dtype: "q8"`
pipeline load once to warm the cache), run `npm run build:search && npm run
build:model` locally, then either commit `public/models/` directly (simplest,
if you're comfortable with a 23 MB commit and don't mind revisiting this
decision) or set up Git LFS properly (§ option 2 above, if the repo is going
to carry binary assets regularly). Either way, re-run `npm run build` once
locally afterward and confirm the palette shows `semantic · HNSW` instead of
`lexical · BM25` after enabling it.

## 7. Why there's no `vercel.json`

Checked whether one was warranted for cache headers on `public/search/*` and
(if committed later) `public/models/*`, these files are stable *within* a
deployment but aren't content-hashed by filename, so an aggressive
`immutable` cache header would be a real correctness bug: a returning visitor
could keep an old `chunks.json` after a content update and get stale search
results with no error, which is exactly the kind of silent breakage
`check:search` exists to catch elsewhere in this codebase.

Checked what Next actually serves today, from a production build
(`next start`, `curl -sD -`):

```
GET /search/chunks.json
Cache-Control: public, max-age=0
ETag: W/"8a54-..."
```

`max-age=0` forces revalidation on every load; the `ETag` makes that
revalidation a cheap `304`, not a full re-download. That's already the
correct behavior for a non-hashed file whose content can change between
deployments, there's nothing to add, and adding a longer `max-age` would
make things worse, not better. Next.js on Vercel is otherwise zero-config for
this app (no redirects, rewrites, cron functions, or custom regions are
needed), so `vercel.json` stays unwritten. Revisit only if a future artefact
under `public/` genuinely becomes content-hashed by filename.

## 8. `SITE.url`, what it must be and why

`src/lib/site.ts` exports `SITE.url`, currently `"https://tadiwa.org"`,
**already correct**, no change needed for this domain. It's the single
source of truth for:

- `metadataBase` in `src/app/layout.tsx`, which resolves every relative OG
  image and social-card URL emitted by the framework's metadata API. Wrong
  value → OG cards on X/LinkedIn/iMessage link previews point at the wrong
  host, or at `localhost` if it's ever left as a dev default.
- `src/app/sitemap.ts`, every URL in `sitemap.xml` is `${SITE.url}${path}`.
- `src/app/robots.ts`, the `sitemap:` directive in `robots.txt`.
- The résumé's own URL field (`src/lib/resume-data.ts`), shown to a human
  reader.

If this project is ever redeployed under a different domain (a preview
environment, a rename), update this one string and every one of those four
consumers follows automatically, which is the entire reason it's factored
out instead of being a literal in four files.

## 9. Troubleshooting: "semantic unavailable"

The ⌘K palette's footer shows this when the semantic (second) stage of
search fails to come up. It is not a bug by itself; see §6 for why this is
the expected state of a default deploy. To find out *why*, in order of
likelihood:

1. **Hover the "semantic unavailable" text** (or inspect the element), the
   real error is in its `title` attribute and `data-error`. Read that first;
   don't guess.
2. **`public/models/all-MiniLM-L6-v2/` isn't in this deployment.** This is
   the default, expected state (§6) unless you've deliberately committed the
   model. Confirm with `curl -I https://tadiwa.org/models/all-MiniLM-L6-v2/config.json`
, a 404 means the model genuinely isn't deployed, which is fine; lexical
   search still works.
3. **The model *is* deployed but the fetch still fails.** Check that
   `public/models/all-MiniLM-L6-v2/` has all four files copy-model.sh
   produces: `config.json`, `tokenizer.json`, `tokenizer_config.json`, and
   `onnx/model_quantized.onnx`. A partial copy (e.g. Git LFS pointer files
   checked in without `git lfs pull`, or an incomplete manual commit) fails
   the same way a missing model does, but the `title` attribute's message
   will name the specific file.
4. **Browser or network policy blocking the fetch**, an ad blocker, a
   corporate proxy, or a CSP some other layer added. `next.config.ts`
   deliberately does not set a Content-Security-Policy (its own comment
   explains why: proper CSP needs a per-request nonce for the theme
   bootstrap script, which would force every page off the static path), so
   this site itself won't be the source of a CSP block, but check for one
   injected upstream (a CDN, a corporate network) if this shows up for one
   visitor and not others.
5. **It's actually fine.** Lexical search (`lexical · BM25` in the palette
   footer) is not a degraded fallback in the "worse but acceptable" sense,
   it's the first-class default path this design was built around. If
   semantic search matters enough to fix, that's a §6 decision to revisit,
   not a bug to patch around.
