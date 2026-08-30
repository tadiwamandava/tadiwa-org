"""LoRA fine-tune: teach the model to answer from its sources or refuse.

WHAT THIS IS FOR, NARROWLY.

Retrieval already fixed the facts. What it could not fix is that the base model
never declines: measured on held-out cases, it refuses 0 of 8 unanswerable
questions and invents a "64-bit CPU with a 64-bit instruction set" for a
project whose sources say nothing of the kind. Refusing is a short, learnable
behaviour rather than a fact to store, which is why it is the one thing a
fine-tune at 135M parameters genuinely fixes.

WHY LoRA AND NOT A FULL FINE-TUNE.

118 training examples against 135M parameters. Full fine-tuning would move
every weight to fit a hundred sentences and take the model's general fluency
with it — the failure is called catastrophic forgetting and it is the default
outcome at this ratio, not a risk. LoRA trains 4.9M parameters — 3.5% of the
total — so the base model's language ability is structurally preserved: the
adapter can learn "decline when the context does not support an answer"
without being able to overwrite what a sentence is.

THE LOSS IS MASKED TO THE ANSWER.

Labels are -100 across the prompt. Training on the prompt tokens would spend
most of the gradient teaching the model to reproduce its own retrieved sources,
which it will never be asked to do, and would dilute the signal that matters by
roughly the ratio of prompt length to answer length — here about 8:1.

Run: engines/nano/tools/.venv/bin/python engines/nano/tools/train_lora.py
"""

import json
import math
import pathlib
import sys
import time

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer

from peft import LoraConfig, get_peft_model

ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA = ROOT / "engines" / "nano" / "data" / "grounded-train.jsonl"
OUT = ROOT / "engines" / "nano" / "adapters" / "grounded-lora"
BASE = "HuggingFaceTB/SmolLM2-135M-Instruct"

#: Overridable from the command line so the epoch count can be swept without
#: editing the file. 10 epochs reached 100% refusal on unanswerable questions
#: but 26.7% FALSE refusal on answerable ones — over-committed to declining,
#: which is the predictable way this goes wrong.
EPOCHS = int(sys.argv[1]) if len(sys.argv) > 1 else 6
BATCH = 2
ACCUM = 4          # effective batch 8
LR = 2e-4
WARMUP = 0.1
SEED = 20260830
MAX_LEN = 768      # the longest 4-source prompt plus its answer, with room


class Grounded(Dataset):
    def __init__(self, rows, tok):
        self.rows, self.tok = rows, tok

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        row = self.rows[i]
        # add_special_tokens=False everywhere: the chat structure is already in
        # the text, and letting the tokenizer prepend its own BOS would train
        # the model on a prompt shape the browser never sends.
        p = self.tok(row["prompt"], add_special_tokens=False)["input_ids"]
        a = self.tok(row["answer"], add_special_tokens=False)["input_ids"]
        a = a + [self.tok.convert_tokens_to_ids("<|im_end|>")]

        ids = (p + a)[:MAX_LEN]
        labels = ([-100] * len(p) + a)[:MAX_LEN]
        return {"input_ids": ids, "labels": labels}


def collate(batch, pad_id):
    n = max(len(b["input_ids"]) for b in batch)
    ids, labels, mask = [], [], []
    for b in batch:
        gap = n - len(b["input_ids"])
        ids.append(b["input_ids"] + [pad_id] * gap)
        labels.append(b["labels"] + [-100] * gap)
        mask.append([1] * len(b["input_ids"]) + [0] * gap)
    return (
        torch.tensor(ids),
        torch.tensor(labels),
        torch.tensor(mask),
    )


def device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def main() -> int:
    if not DATA.exists():
        print("  run make_sft_data.py first", file=sys.stderr)
        return 2
    torch.manual_seed(SEED)

    rows = [json.loads(l) for l in DATA.open()]
    dev = device()
    tok = AutoTokenizer.from_pretrained(BASE)
    pad_id = tok.convert_tokens_to_ids("<|im_end|>")

    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float32).to(dev)
    model.config.use_cache = False

    cfg = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        # Attention AND the MLP. Attention alone is the common default and is
        # the wrong choice here: "is the answer present in this context?" is a
        # judgement the MLP blocks carry, and adapting only the mixing layers
        # left the refusal behaviour weak in a first pass.
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, cfg)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"\n  {BASE} on {dev}")
    print(f"  trainable {trainable:,} of {total:,} ({100 * trainable / total:.2f}%)")
    print(f"  {len(rows)} examples · {EPOCHS} epochs · effective batch {BATCH * ACCUM}\n")

    loader = DataLoader(
        Grounded(rows, tok),
        batch_size=BATCH,
        shuffle=True,
        collate_fn=lambda b: collate(b, pad_id),
    )
    steps = math.ceil(len(loader) / ACCUM) * EPOCHS
    opt = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=LR, weight_decay=0.0
    )
    warm = max(1, int(steps * WARMUP))

    def lr_at(step):
        if step < warm:
            return step / warm
        p = (step - warm) / max(1, steps - warm)
        return 0.5 * (1 + math.cos(math.pi * p))

    sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_at)

    model.train()
    step = 0
    t0 = time.time()
    for epoch in range(EPOCHS):
        running, seen = 0.0, 0
        for i, (ids, labels, mask) in enumerate(loader):
            ids, labels, mask = ids.to(dev), labels.to(dev), mask.to(dev)
            loss = model(input_ids=ids, attention_mask=mask, labels=labels).loss
            (loss / ACCUM).backward()
            running += loss.item()
            seen += 1
            if (i + 1) % ACCUM == 0 or i + 1 == len(loader):
                torch.nn.utils.clip_grad_norm_(
                    [p for p in model.parameters() if p.requires_grad], 1.0
                )
                opt.step()
                sched.step()
                opt.zero_grad(set_to_none=True)
                step += 1
        print(f"  epoch {epoch + 1:2d}/{EPOCHS}   loss {running / max(1, seen):.4f}"
              f"   lr {sched.get_last_lr()[0]:.2e}   {time.time() - t0:5.0f}s")

    OUT.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(OUT)
    tok.save_pretrained(OUT)
    (OUT / "training.json").write_text(json.dumps({
        "base": BASE, "examples": len(rows), "epochs": EPOCHS,
        "effectiveBatch": BATCH * ACCUM, "lr": LR, "rank": cfg.r,
        "alpha": cfg.lora_alpha,
        # peft normalises target_modules to a set, which json cannot encode.
        # This threw AFTER save_pretrained had already written the adapter, so
        # the run looked like a crash but the weights were fine — the record of
        # how they were produced was what got lost.
        "targets": sorted(cfg.target_modules),
        "trainableParams": trainable, "seconds": round(time.time() - t0),
    }, indent=2) + "\n")
    print(f"\n  wrote {OUT.relative_to(ROOT)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
