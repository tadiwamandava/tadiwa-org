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

Those eleven queries were not enough. The tokenizer kept trailing punctuation,
so `quantisation` and `quantisation.` were separate terms with separate posting
lists and a query for one silently missed every document indexed under the
other — **13.2% of the vocabulary**, 197 of 1495 terms, and 94 pairs that were
pure duplicates. Every ranking assertion passed before *and* after the fix,
because none of them happened to use a word that ended a sentence. Ranking
cannot see this, so the gate now also checks the index's **shape**: a term that
is another term plus trailing punctuation is always a bug. Verified against the
pre-fix index — it reports 191 and exits 1.

## Inference

`/lab/inference` runs a transformer forward pass written by hand in C++ and
compiled to WebAssembly — no ML framework, no BLAS, no server call. Ask it a
question and **SmolLM2-135M-Instruct** answers in the visitor's tab at about
25 tokens a second.

The weights are Hugging Face's and the page says so above the demo, not in a
footnote. What is mine is everything between the file and the token, and that
list is the reason the exercise was worth doing:

- **Engine** — `engines/nano`, ~1,700 lines of C++ built with
  `em++ -O3 -msimd128`. 80,275 bytes of wasm, 34,827 gzip. RMSNorm, RoPE,
  grouped-query attention, SwiGLU, tied embeddings, a KV cache, byte-level BPE,
  and a weight-only int8 matmul that multiplies the codes where they lie. That
  last one is not a micro-optimisation: dequantising on load would cost 513 MB
  resident instead of 129 MB, and only one of those survives a browser tab.
- **Tokeniser** — the same byte-level BPE algorithm the GPT-2 family uses,
  reimplemented from the merge table. `npm run test:nano:bpe` checks it against
  HuggingFace on ten cases and requires **10/10 exact**, because a tokeniser
  that is 95% right does not produce 95% as good output — it feeds the model
  sequences it never saw in training, and the failure looks like fluent
  nonsense rather than an error. The first version scored 9/10 by treating
  every byte ≥ 0x80 as a letter; `em—dash` became one pre-token where the
  reference splits it in three.
- **Parity** — the only claim worth making about an engine is that it computes
  what the reference computes. `npm run test:nano:llama` replays a fixed prompt
  through the C++, KV cache included, and diffs the final logits against
  PyTorch. fp32 agrees to **4.1e-05** across thirty layers; int8 diverges by
  **0.81** in the worst logit and still selects the same token. That gap is the
  quantisation trade, stated as a measurement.
- **Kernels** — `npm run test:nano` checks each of the ten ops against golden
  fixtures generated by a numpy oracle. The fixtures are data, not a reference
  implementation.

The parity diff earned its keep. The converter read `rope_theta` with a
default; this transformers version nests the real value (100,000) inside
`rope_scaling`, so the engine ran on 10,000. RoPE's angle is zero at position
zero, so single-token output was *exact*, the argmax stayed correct, and
everything looked fine — while the error grew with every token after. The logit
diff said 6e-01. After the fix, 4e-05. The converter now raises rather than
defaulting.

The second model in the selector is one I did train — 359K parameters on 66 KB
of this site's prose, train loss 1.19 against validation 1.94, which is
memorisation. It is kept because the comparison is the content: same engine,
same kernels, and the entire difference in output quality is the weights.

## Making it stop making things up

Asked cold what a KV cache is, SmolLM2-135M answered that it *"stores the
current and voltage values from previous cycles"*. It does not know, so it
interpolates. Nothing fixes that at 135M parameters by training — there is
nowhere to keep the fact — so it is not asked to recall one. The BM25 index
that already answers ⌘K retrieves the passages, they go into the prompt, and
the job drops from *know things* to *read four paragraphs and answer from
them*. The passages are listed under the answer with links. Chat mode is kept
as the control.

Retrieval could not fix the second half: handed sources that did not contain
the answer, the base model answered anyway. So that part **is** a fine-tune —
a LoRA on 4.9M parameters (3.5% of the model), 122 examples built from this
corpus, loss masked to the answer span. Measured on 29 held-out cases, held out
**by page** so the eval pages contributed nothing to training:

| | stock | + grounded LoRA |
|---|---|---|
| refuses when it should | 0% (0/14) | **100%** (14/14) |
| refuses when it shouldn't | 0% | **6.7%** (1/15) |
| grounding (5-gram overlap with sources) | 5.7% | **94.0%** |

The middle column is what keeps the first honest — a model trained hard enough
on refusals refuses everything and scores 100% on the left while being useless.
Both are always reported.

The training answers are **quoted from the corpus, not written by a larger
model**. Copying from context is the target behaviour; supervision written by
something smarter teaches this model to sound smarter, which produces more
confident invention rather than less. It also keeps "no API I called" true of
the training data.

Two things this got wrong first, both caught by measuring rather than
reasoning:

- An earlier run showed 26.7% false refusal and the obvious reading was
  over-training. Retraining at 6 and 10 epochs against identical data and eval
  showed the **longer** run was better; the first number came from a narrower
  eval set. Fifteen answerable cases means one case is 6.7% — thin enough that
  the honest conclusion is that the two configurations are hard to tell apart.
- "What is the K20 Content Curation Platform?" retrieved that project's
  Writeup, two Decisions and a Hindsight — four passages about it, none saying
  what it *is* — so the model correctly declined. Every chunk of a project
  shares its title, so title terms cannot discriminate, and BM25 ranks the long
  writeup over the short pitch. The pitch is now pinned rather than ranked. The
  first version of that fix checked the over-fetched list, found the pitch at
  rank five, did nothing, and the truncation dropped it again — which a browser
  test caught and a unit test would not have.

**The 129 MB weights file is not committed** — it is over GitHub's per-file
ceiling. See `DEPLOY.md` for how to serve it and what the page does when it is
absent.

## Voice

The microphone, the retrieval, the model and the speech all run on the visitor's
machine. Whisper-tiny.en (42 MB, int8) transcribes through ONNX Runtime Web,
fetched same-origin; `speechSynthesis` reads the answer back. The browser's own
`SpeechRecognition` would have been one line and no download — and in Chrome it
uploads the audio to Google. A site arguing that no server does the interesting
part cannot put its microphone on someone else's server.

The voice that reads answers back is chosen by locale preference — `en-ZA`,
then other African English locales, then `en-GB`, then any English — and the
panel names the voice actually in use. **The voice list belongs to the operating
system; a web page can choose from it but cannot add to it.** On the machine
this was built on, 199 voices are installed and exactly one is African English
(Tessa, en-ZA). Many devices will have none, and the UI says so plainly rather
than implying a choice that was not available. There is a picker, because the
right answer is the visitor's device's, not this code's.

The transcript lands in the textarea rather than auto-submitting. A wrong
transcription that silently becomes a question produces an answer to something
nobody asked, and the visitor has no way to tell that is what happened.

**Whisper does not load in the browser with default settings**, and the reason
is worth recording because it cost real time. ONNX Runtime Web's QDQ graph
optimiser throws on whisper's merged decoder:

```
qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits
Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale
```

Measured, not guessed: it fails on `onnx-community` **and** `Xenova`
whisper-tiny.en, at q8, int8, uint8, q4 and fp32 alike, and on moonshine-tiny
too — while MiniLM loads fine through the same runtime, which is what ruled out
a broken ORT setup. `session_options: { graphOptimizationLevel: "disabled" }`
is what makes the session build. It is a correctness requirement here, not a
tuning knob.

The trap underneath it: the same q8 files load fine in **onnxruntime-node**, so
the Node smoke test in `scripts/fetch-voice-model.ts` passes and proves nothing
about the browser. Only a real browser can check this, which is what
`scripts/cdp.mjs` is for.

### The visualiser

The assistant has a face: a gold wireframe sphere, hand-written Canvas2D with
its own perspective projection. three.js would have been ~600 KB to draw lines,
and the interesting part — projection, depth cueing, additive blending — is
thirty lines of maths.

What drives it is deliberately two different signals, because the two
directions of a conversation expose different things:

- **Listening** is a real FFT of the microphone. Each shard is bound to a
  frequency bin, so the shape genuinely is the spectrum of your voice.
- **Speaking** pulses on word-boundary events. Synthesised audio never enters
  the WebAudio graph — the platform plays it directly — so there is no spectrum
  to analyse, and animating one anyway would be a visualisation lying about its
  source.

60 fps with a worst frame of 20.7 ms, measured in headless Chrome with no GPU.
`prefers-reduced-motion` draws one static frame and stops the loop: the shape is
information, the movement is not. The canvas is `aria-hidden` and every state it
depicts is also written in text beneath it.

The first attempt read as a sea urchin — 340 long spikes, an explosion rather
than a sphere. The reference silhouette is a dense *shell*: short structures
packed on a surface, with the volume carried by concentric arcs rather than
radial reach.

## The hosted comparison

`/lab/inference` can send the same grounded question to **Kimi K3** and render
its answer beside the local one. Kimi K3 is 2.8 trillion parameters — roughly a
terabyte of weights even at four bits, and mixture-of-experts needs every expert
resident regardless of which ones a token activates. It is four orders of
magnitude past what a tab can hold, and that gap is the content: both models get
the same four retrieved passages and the same system prompt, so what differs is
attributable.

It is the only thing here that leaves the machine, it is opt-in per question
rather than per session, and it is off unless `OPENROUTER_API_KEY` is set. The
client sends only a question, truncated to 300 characters; the server does its
own retrieval over the committed corpus and builds the prompt itself, so the
endpoint cannot be used to relay arbitrary text to a paid API. Rate limiting is
per-IP and best-effort by construction — serverless instances do not share
memory — so the bound that actually holds is a spend cap set at the provider.
See `DEPLOY.md`.

## Build gates

| Command | What it enforces |
|---|---|
| `npm run typecheck` | Strict TS. Runs `next typegen` first — without it, route types lag behind new routes. |
| `npm run lint` | ESLint, including React correctness rules. |
| `npm run check:contrast` | WCAG AA across **both** themes, plus parity between the two dark-theme blocks. Parses the real stylesheet rather than a copy of the palette — a duplicated palette drifts and then certifies a theme nobody ships. |
| `npm run check:content` | Every MDX file against the corpus schema; flags leftover `TODO`/`CONFIRM` placeholders; catches corpus-level bugs a per-file schema cannot see (duplicate `pinOrder`, `finished` before `started`). |
| `npm run check:links` | Every internal href resolves — including template-literal prefixes, so a typo like `/project/${slug}` is caught rather than silently killing every project link. |
| `npm run check:search` | The shipped lexical scorer against the shipped index, on real queries. Guards against the build-time and runtime tokenizers drifting apart. Needs no model download — the index it checks is already committed. |
| `npm run check:prompt` | The grounded-answer prompt against a golden rendering. The format is assembled in TypeScript for the browser and in Python for the fine-tuning data; training on one format and serving another degrades output with no error anywhere. |
| `npm run check:bundle` | Critical JS on first paint, read from the build manifests. Next 16 removed `First Load JS` from build output, so this cannot be scraped from the log. |
| `npm run test:nano` | Each inference kernel against golden fixtures. Reports "stub" for unstarted work, so an unfinished engine reads as unfinished rather than broken. |
| `npm run test:nano:parity` | End-to-end logit agreement with PyTorch, fp32 and int8. Catches the class of bug the op tests cannot — a transposed weight, a mis-sliced head, an off-by-one in the KV cache. Needs no Python; the reference logits are committed. |
| `npm run test:nano:bpe` | The tokeniser against HuggingFace, token for token. Blob and golden cases are both committed, so this always runs. |
| `npm run test:nano:llama` | SmolLM2 logit parity. **Skips** rather than fails when the weights are not in the checkout — a gate that goes red for a reason unrelated to correctness gets ignored, and then it is not a gate. The engine still compiles on every run. |
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
- **The model weights should never have been repo files.** The 359K weights
  are committed (1.8 MB) because regenerating them needs PyTorch, which is
  defensible. SmolLM2's 129 MB was committed too, and that one was simply
  wrong — it is over GitHub's per-file limit, so it cannot be pushed, and the
  fix costs a history rewrite. Model weights are release artefacts.
- **Screenshots are not verification.** `--screenshot` and `--dump-dom` both
  fire at the load event, so both reported the command palette missing when it
  was simply not mounted yet. That cost real time before `scripts/cdp.mjs`
  existed.
