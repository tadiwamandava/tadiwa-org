# Deploying tadiwa.org

Written for whoever does this next, possibly future me, with no memory of
any of it. Everything below was verified against the actual repo, not
inferred from the config files.

---

## 1. Prerequisites

- Node.js **≥ 20.9** locally, to match what Next.js 16 itself requires
  (`node_modules/next/package.json` declares `"engines": {"node": ">=20.9.0"}`
, an older Node fails the build outright, not just a warning).
- A Coolify instance and a server it can deploy to. Docker is the only runtime
  requirement; the image builds everything else it needs.
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

## 3. Coolify

Coolify runs the container on a machine you own, which changes two things this
document used to be apologetic about. The filesystem is writable and
persistent, so `/admin` can genuinely work; and there is no per-request billing
model to worry about when a visitor downloads 129 MB of model weights.

### Project settings

| Setting | Value | Why |
|---|---|---|
| Build Pack | **Dockerfile** | The repo has one. Nixpacks would guess, and guess wrong about the model-fetching stages. |
| Dockerfile Location | `/Dockerfile` | Default. |
| Port | **3000** | `EXPOSE 3000`, and the server reads `PORT`. Coolify's proxy terminates TLS in front. |
| Health Check Path | `/api/health` | Already declared as a `HEALTHCHECK` in the image; setting it here makes Coolify use it for rollout decisions too. |
| Build Arg | `SMOLLM_URL` | Optional. A URL to `smollm-int8.bin`; see §5b. Without it the build still succeeds. |

TLS and the domain are Coolify's job: point the DNS at the server (§5), set the
FQDN on the resource, and it provisions Let's Encrypt. Nothing in this repo
needs to know about it beyond `SITE.url` (§8).

### The build

Four stages, and the reason for the split is the models rather than Next:

- `deps` runs `npm ci` against the committed lockfile.
- `models` downloads MiniLM (22 MB) and Whisper (42 MB) from Hugging Face and
  copies them into `public/models/`, so the browser fetches them same-origin.
  Separate stage so a content edit does not re-download 64 MB.
- `builder` runs `next build` with `output: "standalone"`.
- `runner` is `node:22-slim` with a non-root user and no build tooling.

`output: "standalone"` traces the server's actual imports. It does **not**
include `public/` or `.next/static`; the Dockerfile copies both explicitly.
Forgetting either gives a site that boots and serves no CSS, which reads as a
styling bug rather than a packaging one, so `/api/health` checks for it.

### The content volume, and the decision you have to make

`content/` is not a build artefact here. `/projects`, `/resume` and every
`/admin` route are dynamic and read the MDX per request, so it has to exist at
runtime. It is also what the admin writes to, and that is where it gets
interesting.

**Without a volume** the corpus comes from the image and always matches git.
Anything saved through `/admin` lives until the next deploy and then goes.
That makes the deployed admin a preview surface, not a source of truth.

**With a volume** mounted at `/app/content`, saves persist. The catch is that a
mounted volume *shadows* the image's copy, so a fresh volume would give a
container with no projects, no writing and an empty résumé, which looks like a
broken build rather than an empty disk. The image therefore keeps a pristine
copy at `/app/content-image` and `docker-entrypoint.sh` seeds the volume the
first time it finds it empty, and never again, because overwriting it later
would silently discard whatever had been edited.

The real cost of the volume is not technical. Once it diverges, the deployed
corpus and the repository are two different things, and nothing reconciles
them: you would be editing content that git does not know about, on a site
whose entire argument is that its content lives in git. The honest fix is a
`ContentStore` that commits through the GitHub API, and `src/lib/admin/store.ts`
is the seam that goes behind.

Start without the volume. Add it only if you decide remote editing is worth
that divergence.

## 4. Environment variables

**None are required.** One is worth setting.

`NEXT_PUBLIC_NANO_WEIGHTS_BASE`, a directory URL for the SmolLM2 weights,
defaulting to `/nano` (same-origin). Set it when the 129 MB weights file is
hosted somewhere other than this deployment, which it usually has to be; §5b
covers the options and what the page does when it is unset and the file is
absent. Public by construction: it is a URL the browser fetches, not a secret.

The only other `process.env` reads anywhere in `src/` or `scripts/` are both
`process.env.NODE_ENV`. The Dockerfile sets it to `production`, and it is never
`development` in a built image, so neither needs a value you set:

- `src/lib/content/index.ts`, hides draft posts outside development.
- `src/lib/admin/guard.ts`, gates the entire `/admin` content editor. With no
  admin secrets set, `/admin` 404s and every one of its Server Actions throws
  before touching disk, on every deployment, with no configuration needed to
  make that true. Setting the two secrets in §4b turns on a password login
  instead. See §4b.

### 4b. Admin login

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

**On Coolify this works**, which was not true of the serverless host this
document used to describe. The container's filesystem is writable and the
process is long-lived, so a save reaches disk and stays there for as long as
the container lives. Whether it survives a *redeploy* is the volume decision in
§3, and that decision is about git divergence rather than about auth.

Set both secrets and the deployed admin is genuinely usable. Leave them unset
and `/admin` 404s in production exactly as before, with editing done through
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
  rate-limits per IP (5/minute) and caps `max_tokens`. On a single container
  that counter is actually shared, which is better than it was on serverless,
  but it still resets on every redeploy.
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

Coolify serves from a machine with a fixed IP, so this is an `A` record rather
than a delegation:

- `A` for the apex (`tadiwa.org`) pointing at the server's public IP.
- `A` or `CNAME` for `www`, then decide which one is canonical. Set the
  canonical FQDN on the Coolify resource and add the other as a redirect, so
  there is one origin rather than two identical ones competing in search
  results.
- Let the record propagate **before** setting the FQDN in Coolify. Let's
  Encrypt validates over HTTP, and a challenge issued against a domain that
  does not resolve yet fails and then rate-limits.

Coolify provisions and renews the certificate itself once the FQDN is set and
DNS resolves; there is nothing to configure in this repo for it.

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

On Coolify the simplest answer is to bake the file into the image: pass
`SMOLLM_URL` as a build arg pointing at a copy of `smollm-int8.bin` (a GitHub
release asset, an S3 object, anything the builder can reach once). The browser
then fetches it same-origin from `/nano/` with no extra configuration, and
`NEXT_PUBLIC_NANO_WEIGHTS_BASE` stays unset.

If you would rather not carry 129 MB in the image, set
`NEXT_PUBLIC_NANO_WEIGHTS_BASE` to a directory URL holding `smollm-int8.bin`
and `smollm-tokenizer.bin` instead. It defaults to `/nano` (same-origin). The
value is inlined at build time and is a public URL, not a secret. Options:

1. **Cloudflare R2**, recommended. No egress fees, which matters when the
   asset is 129 MB and one curious visitor costs 129 MB of it. Attach a custom
   domain (`weights.tadiwa.org`) and set the variable to that. R2 needs a CORS
   rule allowing `GET` from the site's origin, or the browser fetch fails with
   an opaque network error rather than a status code.
2. **The Coolify server itself.** The image can bake the file in at build via
   the `SMOLLM_URL` build arg (§3), so the only thing that needs a URL is the
   build, not the browser. Bandwidth is then your server's, with no per-request
   billing to reason about.
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

1. **Run `build:search` + `build:model` as part of the image build.**
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
   time" contract, not this pass), enabling Git LFS on the build, and a GitHub
   LFS bandwidth quota (1 GB/month on the free tier) that
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

## 7. Why there is no compose file

Coolify builds from the `Dockerfile` and manages the container, network and
proxy itself. A `docker-compose.yml` in the repo would either duplicate that or
quietly disagree with it, and the settings worth pinning (port, health check,
build arg, volume) are the ones in §3 that live in the Coolify resource where
they are visible.

The one file that does exist is `.dockerignore`, and it is load-bearing rather
than tidy: without it the build context is about 1.5 GB, because the repo
carries a 513 MB fp32 checkpoint, a 540 MB merged LoRA adapter and a PyTorch
venv, none of which the running server touches.

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
