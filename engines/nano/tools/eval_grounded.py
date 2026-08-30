"""Measures whether the model answers from its sources or from its weights.

Three numbers, because "less hallucination" is not one behaviour:

  REFUSAL     on unanswerable questions. Should be high. This is the failure
              that started all of this: four sources that do not contain the
              answer, and the base model answers anyway.

  FALSE REFUSAL on answerable questions. Should be low, and it is the number
              that keeps the first one honest. A model trained hard enough on
              refusals refuses everything and scores 100% on REFUSAL while
              being useless. Reporting only the first would hide that.

  GROUNDING   on the answers it does give — the share of generated 5-grams
              that appear verbatim in the sources it was shown. An
              approximation, not a proof: a model can be faithful while
              paraphrasing, and would score low here. It is reported because it
              moves in a direction that is interpretable alongside the other
              two, not as a truth measure on its own.

Held-out by URL, so the eval pages contribute nothing to training. Greedy
decoding, matching what the browser does in grounded mode.

Run: engines/nano/tools/.venv/bin/python engines/nano/tools/eval_grounded.py [adapter_dir]
"""

import json
import pathlib
import re
import sys

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA = ROOT / "engines" / "nano" / "data" / "grounded-eval.jsonl"
TEMPLATE = ROOT / "engines" / "nano" / "prompts" / "grounded.v1.json"
BASE = "HuggingFaceTB/SmolLM2-135M-Instruct"
MAX_NEW = 120


def device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def ngrams(text: str, n: int = 5) -> set[tuple[str, ...]]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {tuple(words[i : i + n]) for i in range(max(0, len(words) - n + 1))}


def is_refusal(text: str, refusal: str) -> bool:
    """Substring match on the distinctive opening rather than string equality.

    The model reproduces the refusal with drifting punctuation — a straight
    hyphen for the em dash, a missing full stop. Requiring an exact match would
    score those as hallucinations, which is the opposite of what happened."""
    t = text.strip().lower()
    return t.startswith("i don't know") or t.startswith("i do not know") or t == refusal.lower()


def main() -> int:
    adapter = sys.argv[1] if len(sys.argv) > 1 else None
    if not DATA.exists():
        print("  run make_sft_data.py first", file=sys.stderr)
        return 2

    refusal = json.loads(TEMPLATE.read_text())["refusal"]
    rows = [json.loads(l) for l in DATA.open()]

    dev = device()
    tok = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float32).to(dev)
    label = "base"
    if adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter).to(dev)
        label = pathlib.Path(adapter).name
    model.eval()

    eos = tok.convert_tokens_to_ids("<|im_end|>")
    buckets: dict[str, list] = {}

    for row in rows:
        ids = tok(row["prompt"], return_tensors="pt").to(dev)
        with torch.no_grad():
            out = model.generate(
                **ids,
                max_new_tokens=MAX_NEW,
                do_sample=False,
                eos_token_id=eos,
                pad_token_id=eos,
            )
        text = tok.decode(out[0][ids["input_ids"].shape[1] :], skip_special_tokens=True).strip()
        sources = row["prompt"].split("Sources:\n", 1)[1].split("<|im_end|>")[0]

        gen_ng = ngrams(text)
        overlap = (
            len(gen_ng & ngrams(sources)) / len(gen_ng) if gen_ng else 1.0
        )
        buckets.setdefault(row["kind"], []).append(
            {
                "q": row["question"],
                "text": text,
                "refused": is_refusal(text, refusal),
                "grounding": overlap,
            }
        )

    print(f"\n  GROUNDED BEHAVIOUR — {label}  ({dev}, greedy, {len(rows)} held-out cases)\n")

    unans = buckets.get("unanswerable-near", []) + buckets.get("unanswerable-far", [])
    ans = buckets.get("answerable", [])

    def pct(n, d):
        return f"{100 * n / d:5.1f}%" if d else "    — "

    refused_unans = sum(r["refused"] for r in unans)
    refused_ans = sum(r["refused"] for r in ans)
    answered = [r for r in ans if not r["refused"]]
    grounding = sum(r["grounding"] for r in answered) / len(answered) if answered else 0.0

    print(f"    refusal on unanswerable    {pct(refused_unans, len(unans))}   "
          f"({refused_unans}/{len(unans)})      higher is better")
    print(f"    false refusal on answerable{pct(refused_ans, len(ans))}   "
          f"({refused_ans}/{len(ans)})      lower is better")
    print(f"    grounding of given answers {grounding * 100:5.1f}%          "
          f"(5-gram overlap with sources)")

    print("\n  Samples\n")
    for kind in ("unanswerable-far", "unanswerable-near", "answerable"):
        for r in buckets.get(kind, [])[:2]:
            mark = "refused" if r["refused"] else f"answered g={r['grounding']:.2f}"
            print(f"    [{kind}] {r['q']}")
            print(f"      {mark}: {r['text'][:150]}")
    print()

    summary = {
        "label": label,
        "cases": len(rows),
        "refusalOnUnanswerable": refused_unans / len(unans) if unans else None,
        "falseRefusalOnAnswerable": refused_ans / len(ans) if ans else None,
        "groundingOfAnswers": grounding,
        "counts": {k: len(v) for k, v in buckets.items()},
    }
    out_path = ROOT / "engines" / "nano" / "fixtures" / f"grounded-eval-{label}.json"
    out_path.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"  wrote {out_path.relative_to(ROOT)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
