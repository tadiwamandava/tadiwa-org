"""Builds the supervised set that teaches "answer from the sources, or refuse".

WHAT THIS IS AND IS NOT TEACHING.

It is not teaching facts. 135M parameters trained on 99 passages will not learn
what a KV cache is, and trying would just overfit. Retrieval already solved the
facts problem — the passages arrive in the prompt.

What is left is an INSTRUCTION-FOLLOWING failure, and it is measurable: given
four sources that do not contain the answer, the base model answers anyway. It
invents "an array of registers or memory locations" rather than saying it does
not know. That is the one thing at this scale a fine-tune genuinely does fix,
because refusing is a short, learnable behaviour rather than a fact to store.

WHY THE ANSWERS ARE EXTRACTIVE.

Every answer here is built from the source text, not written by a larger model.
Two reasons, and the first is the real one:

  1. Copying from the context IS the target behaviour. Supervision that quotes
     the sources teaches exactly the habit we want. Supervision written by a
     smarter model would teach this one to sound like a smarter model, which is
     how you get more confident hallucination, not less.
  2. It keeps the pipeline honest with the rest of the site — no API call sits
     anywhere in this repo, including in the training data.

The prompt format comes from prompts/grounded.v1.json, the same file the
browser renders from. If they drift, the model is trained on one format and
served another, which degrades output with no error anywhere.

Run: engines/nano/tools/.venv/bin/python engines/nano/tools/make_sft_data.py
"""

import json
import math
import pathlib
import random
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
CHUNKS = ROOT / "public" / "search" / "chunks.json"
LEXICAL = ROOT / "public" / "search" / "lexical.json"
TEMPLATE = ROOT / "engines" / "nano" / "prompts" / "grounded.v1.json"
OUT = ROOT / "engines" / "nano" / "data"

SEED = 20260830
HELD_OUT_FRACTION = 0.2

STOP = set(
    "a an and are as at be but by for from had has have i if in into is it its of on or "
    "that the their then there these they this to was were what when which who will with you".split()
)


# --------------------------------------------------------------------------
#  BM25, ported from src/lib/search/lexical.ts
#
#  Ported rather than shelled out to, so the training sources are drawn from
#  the same ranking the browser will use at serve time. Training on gold
#  passages and serving retrieved ones is a distribution mismatch that shows up
#  as the model trusting its context more than it should.
# --------------------------------------------------------------------------
def tokenize(s: str) -> list[str]:
    s = re.sub(r"[^a-z0-9+#./-]+", " ", s.lower())
    out = []
    for t in s.split():
        t = re.sub(r"[.\-/]+$", "", t)
        if len(t) > 1 and t not in STOP:
            out.append(t)
    return out


def bm25(query: str, index: dict, chunks: list[dict], limit: int) -> list[dict]:
    terms = tokenize(query)
    if not terms:
        return []
    postings = index["postings"]
    n = len(index["lengths"])
    scores: dict[int, float] = {}
    for term in terms:
        matched = [postings[term]] if term in postings else [
            p for t, p in list(postings.items()) if t.startswith(term)
        ][:12]
        for plist in matched:
            df = len(plist)
            idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
            for cid, tf in plist:
                ln = index["lengths"][cid] if cid < len(index["lengths"]) else index["avgLen"]
                norm = index["k1"] * (1 - index["b"] + index["b"] * ln / index["avgLen"])
                scores[cid] = scores.get(cid, 0.0) + idf * tf * (index["k1"] + 1) / (tf + norm)
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])[:limit]
    return [chunks[cid] for cid, _ in ranked if cid < len(chunks)]


# --------------------------------------------------------------------------
#  Prompt rendering — mirrors src/components/nano/prompt.ts
# --------------------------------------------------------------------------
TPL = json.loads(TEMPLATE.read_text())


def fill(pattern: str, **vars_) -> str:
    def sub(m):
        return str(vars_.get(m.group(1), m.group(0)))
    return re.sub(r"\{(\w+)\}", sub, pattern)


def render_sources(passages: list[dict]) -> str:
    budget = TPL["budget"]
    out, chars = [], 0
    for c in passages[: budget["maxSources"]]:
        block = fill(
            TPL["source"], n=len(out) + 1, title=c["title"], section=c["section"], text=c["text"]
        )
        if out and chars + len(block) > budget["maxSourceChars"]:
            break
        out.append(block)
        chars += len(block)
    return TPL["sourceSeparator"].join(out)


def grounded_prompt(question: str, passages: list[dict]) -> str:
    system = fill(TPL["system"], sources=render_sources(passages))
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{question.strip()}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )


# --------------------------------------------------------------------------
#  Question and answer construction
# --------------------------------------------------------------------------
# Only self-contained sections get to be the GOLD chunk.
#
# "Writeup" and "Post" chunks are sliding word windows, so most of them begin
# and end mid-sentence. An extractive answer taken from one starts mid-clause
# — "remaining gap exists — occupancy against register pressure" — and training
# on that teaches the model to open its answers mid-sentence, which is a worse
# habit than the one being fixed. They still appear as context and as
# distractors, which is where they are useful; they just never define the
# expected answer.
QUESTION_BY_SECTION = {
    "Pitch": ["What is {title}?", "What does {title} do?", "Tell me about {title}."],
    "What's hard": [
        "What was the hardest part of {title}?",
        "What is difficult about {title}?",
        "What made {title} hard to build?",
    ],
    "Decision": [
        "What design decision was made in {title}?",
        "Why was {title} built the way it was?",
    ],
    "Hindsight": [
        "What would be done differently in {title}?",
        "What are the regrets on {title}?",
    ],
    "Summary": ["What is {title} about?", "Summarise {title}."],
}

#: Sections that can be a gold chunk. Everything else is context only.
GOLD_SECTIONS = set(QUESTION_BY_SECTION)

#: Questions per gold chunk. The corpus is small, so squeeze the phrasings
#: rather than the passages — varied questions over the same fact teach the
#: mapping; the same question repeated teaches the string.
QUESTIONS_PER_CHUNK = 3

# Questions the corpus provably cannot answer. These target the exact observed
# failure: a general-knowledge question, real site passages in the context, and
# a base model that answers from its weights anyway.
OUT_OF_SCOPE = [
    "What is the capital of France?",
    "Who wrote Pride and Prejudice?",
    "What is the boiling point of water?",
    "How do I make sourdough bread?",
    "What year did the Berlin Wall fall?",
    "What is the tallest mountain in the world?",
    "Who is the president of the United States?",
    "What is the chemical symbol for gold?",
    "How many players are on a football team?",
    "What is Tadiwa's phone number?",
    "What is Tadiwa's home address?",
    "What is Tadiwa's salary?",
    "What did Tadiwa study in high school?",
    "Does Tadiwa have a security clearance?",
    "What is the airspeed velocity of an unladen swallow?",
    "How far is the Moon from Earth?",
    "What language is spoken in Brazil?",
    "Who painted the Mona Lisa?",
    "What is the square root of 144?",
    "When was the Eiffel Tower built?",
    "What is Tadiwa's date of birth?",
    "Which companies has Tadiwa interviewed with?",
    "What is Tadiwa's GPA?",
    "Where does Tadiwa live?",
    "What is the population of Tokyo?",
]


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) > 20]


def extractive_answer(chunk: dict, n: int, rng: random.Random) -> str | None:
    """An answer built only from the source, ending in its citation.

    Deliberately close to a quote. The behaviour being taught is "the answer
    lives in the context"; paraphrasing supervision would teach the model that
    it is allowed to produce text the context does not contain, which is the
    exact latitude it must not have.

    Returns None when no clean sentence can be extracted, rather than emitting
    a fragment. Fewer, cleaner examples beat more, noisier ones at this size."""
    sents = [s for s in sentences(chunk["text"]) if re.match(r'[A-Z"\u201c(]', s)]
    if not sents:
        return None
    take = 1 if len(sents) == 1 else rng.choice([1, 1, 2])
    body = " ".join(sents[:take])
    if not body.endswith((".", "!", "?")):
        body += "."
    return f"{body} [{n}]"


def main() -> int:
    if not CHUNKS.exists() or not LEXICAL.exists():
        print("  run 'npm run build:search' first", file=sys.stderr)
        return 2

    chunks = json.loads(CHUNKS.read_text())
    index = json.loads(LEXICAL.read_text())
    rng = random.Random(SEED)

    # Split by URL, not by chunk. Splitting by chunk would put the pitch of a
    # project in train and its writeup in test, and the eval would then be
    # measuring memorisation of that project rather than generalisation.
    urls = sorted({c["url"] for c in chunks})
    rng.shuffle(urls)
    n_held = max(1, round(len(urls) * HELD_OUT_FRACTION))
    held_out = set(urls[:n_held])

    rows = {"train": [], "eval": []}

    skipped = 0
    for chunk in chunks:
        if chunk["section"] not in GOLD_SECTIONS:
            continue
        split = "eval" if chunk["url"] in held_out else "train"
        templates = QUESTION_BY_SECTION[chunk["section"]]

        # A per-chunk RNG, so what a chunk produces depends only on the chunk.
        # With one shared generator, widening the eval split shifts every
        # later draw and silently rewrites the training set too — which would
        # mean the "before" and "after" numbers came from different data.
        crng = random.Random(SEED ^ (chunk["id"] * 2654435761))

        # Eval uses every phrasing; training samples. The eval set is small
        # because the corpus is small, and a shipping decision measured on
        # fifteen cases is a decision measured on noise — one case is 6.7%.
        asked = (
            list(templates)
            if split == "eval"
            else crng.sample(templates, min(QUESTIONS_PER_CHUNK, len(templates)))
        )

        for i, template in enumerate(asked):
            question = fill(template, title=chunk["title"])

            # ---- answerable -----------------------------------------------
            # Sources are the REAL BM25 result for this question, with the gold
            # chunk forced in if ranking missed it. That mismatch — gold
            # present but not first — is the ordinary case at serve time, so
            # the model should see it during training too.
            retrieved = bm25(question, index, chunks, TPL["budget"]["maxSources"])
            if chunk["id"] not in [c["id"] for c in retrieved]:
                retrieved = [chunk] + retrieved[: TPL["budget"]["maxSources"] - 1]
            position = [c["id"] for c in retrieved].index(chunk["id"]) + 1
            answer = extractive_answer(chunk, position, crng)
            if answer is None:
                skipped += 1
            else:
                rows[split].append({
                    "kind": "answerable",
                    "question": question,
                    "prompt": grounded_prompt(question, retrieved),
                    "answer": answer,
                    "gold_url": chunk["url"],
                })

            # ---- unanswerable: right question, wrong sources ---------------
            # Everything from the gold page is removed, so the context is
            # topically plausible and genuinely lacks the answer. This is the
            # harder refusal, and the one that matters.
            #
            # Only the first phrasing gets a refusal twin. Every phrasing would
            # tip the set past 60% refusals, and a model trained to refuse most
            # of the time refuses the answerable questions too — trading a
            # visible failure for a useless one.
            if i > 0:
                continue
            others = [c for c in chunks if c["url"] != chunk["url"]]
            distractors = [
                c for c in bm25(question, index, others, 12) if c["url"] != chunk["url"]
            ]
            if len(distractors) >= 2:
                rows[split].append({
                    "kind": "unanswerable-near",
                    "question": question,
                    "prompt": grounded_prompt(question, distractors[: TPL["budget"]["maxSources"]]),
                    "answer": TPL["refusal"],
                    "gold_url": None,
                })

    # ---- unanswerable: out of scope entirely -------------------------------
    # Real site passages in the context, a question the site never addresses.
    for i, question in enumerate(OUT_OF_SCOPE):
        split = "eval" if i % 3 == 0 else "train"
        picked = bm25(question, index, chunks, TPL["budget"]["maxSources"])
        if len(picked) < 2:
            picked = rng.sample(chunks, TPL["budget"]["maxSources"])
        rows[split].append({
            "kind": "unanswerable-far",
            "question": question,
            "prompt": grounded_prompt(question, picked),
            "answer": TPL["refusal"],
            "gold_url": None,
        })

    OUT.mkdir(parents=True, exist_ok=True)
    for split, items in rows.items():
        rng.shuffle(items)
        path = OUT / f"grounded-{split}.jsonl"
        with path.open("w") as f:
            for r in items:
                f.write(json.dumps(r) + "\n")
        counts = {}
        for r in items:
            counts[r["kind"]] = counts.get(r["kind"], 0) + 1
        share = counts.get("unanswerable-near", 0) + counts.get("unanswerable-far", 0)
        print(f"\n  {path.relative_to(ROOT)}")
        print(f"    {len(items)} examples · {share} refusals "
              f"({100 * share / max(1, len(items)):.0f}%)")
        for k, v in sorted(counts.items()):
            print(f"      {k:22s} {v}")

    if skipped:
        print(f"\n  skipped {skipped} gold chunk(s) with no clean sentence to quote")
    print(f"\n  held out {n_held} of {len(urls)} pages, by URL: "
          f"{', '.join(sorted(held_out))}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
