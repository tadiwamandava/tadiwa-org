"""Folds the LoRA adapter into the base weights and writes a plain checkpoint.

The C++ engine has no concept of an adapter; it reads one weight matrix per
projection and multiplies. LoRA's B·A update has to be added into those
matrices before conversion, which is what `merge_and_unload` does.

This is a lossless algebraic step, not an approximation: W' = W + (alpha/r)·B·A
is computed once here in fp32. Everything lossy happens afterwards, in the int8
quantisation, and that loss is measured by the parity test rather than assumed.

Run: engines/nano/tools/.venv/bin/python engines/nano/tools/merge_lora.py
Then: engines/nano/tools/.venv/bin/python engines/nano/tools/convert_smollm.py \\
          engines/nano/adapters/grounded-merged
"""

import json
import pathlib
import sys

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from peft import PeftModel

ROOT = pathlib.Path(__file__).resolve().parents[3]
ADAPTER = ROOT / "engines" / "nano" / "adapters" / "grounded-lora"
MERGED = ROOT / "engines" / "nano" / "adapters" / "grounded-merged"
BASE = "HuggingFaceTB/SmolLM2-135M-Instruct"


def main() -> int:
    if not ADAPTER.exists():
        print(f"  {ADAPTER} does not exist, run train_lora.py first", file=sys.stderr)
        return 2

    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float32)
    before = {k: v.clone() for k, v in model.state_dict().items()
              if k.endswith("self_attn.q_proj.weight")}

    model = PeftModel.from_pretrained(model, ADAPTER)
    model = model.merge_and_unload()

    # Evidence the merge did something. A silently-unapplied adapter produces a
    # checkpoint identical to the base, and every downstream number would then
    # describe the model we were trying to change.
    after = model.state_dict()
    moved = 0
    worst = 0.0
    for k, v in before.items():
        d = (after[k] - v).abs().max().item()
        worst = max(worst, d)
        if d > 0:
            moved += 1
    if moved == 0:
        print("  the merged weights are IDENTICAL to the base, adapter not applied",
              file=sys.stderr)
        return 1

    MERGED.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(MERGED)
    AutoTokenizer.from_pretrained(BASE).save_pretrained(MERGED)

    training = ADAPTER / "training.json"
    (MERGED / "merged.json").write_text(json.dumps({
        "base": BASE,
        "adapter": str(ADAPTER.relative_to(ROOT)),
        "qProjLayersChanged": moved,
        "maxAbsWeightDelta": worst,
        "training": json.loads(training.read_text()) if training.exists() else None,
    }, indent=2) + "\n")

    print(f"\n  merged {moved} q_proj matrices, max |Δw| {worst:.4f}")
    print(f"  wrote {MERGED.relative_to(ROOT)}\n")
    print("  next: convert_smollm.py " + str(MERGED.relative_to(ROOT)))
    print("        which also regenerates the parity fixture from THIS checkpoint\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
