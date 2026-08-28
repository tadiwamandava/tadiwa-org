"""Trains tadiwa-nano and exports weights in the engine's binary format.

Training is PyTorch; inference is the C++ in engines/nano/src. That split is
deliberate and it is how this is actually done in industry — you train with a
framework and ship something small that does not depend on one.

The corpus is this site's own prose. It is ~66 KB, which is small enough that
the model memorises a good deal of it; the script prints train and validation
loss so that is visible rather than glossed over. The artefact here is the
engine, not the model.

Architecture must match src/model.cpp exactly:
  pre-LN decoder, fused QKV, tied embeddings, learned positional embeddings,
  tanh-GELU, layernorm eps 1e-5.

Run: engines/nano/tools/.venv/bin/python engines/nano/tools/train_nano.py
"""

import math
import pathlib
import struct
import sys

import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "public" / "nano"

# Small on purpose. With 66 KB of text a bigger model just memorises faster.
N_EMBD, N_HEAD, N_LAYER, BLOCK = 96, 4, 3, 128
DROPOUT = 0.2
STEPS, BATCH, LR = 3000, 32, 3e-3
SEED = 20260827

MAGIC = 0x4E4E4454
VERSION = 1


def corpus() -> bytes:
    parts = []
    for pattern in ("content/*/*.mdx", "README.md", "NEXT.md", "DEPLOY.md",
                    "CONFIRM.md", "engines/nano/README.md"):
        for p in sorted(ROOT.glob(pattern)):
            parts.append(p.read_text(encoding="utf-8"))
    # UTF-8 BYTES, not characters. The prose is full of em dashes, curly
    # quotes, arrows and a stray command symbol, all of which are multi-byte —
    # and the weights format stores one byte per vocabulary entry. Byte-level
    # tokenisation makes the vocabulary closed (at most 256) and handles every
    # character that will ever appear, at the cost of the model having to learn
    # multi-byte sequences itself. That is the same trade GPT-2's BPE makes one
    # level up.
    return "\n\n".join(parts).encode("utf-8")


class Block(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.ln1 = nn.LayerNorm(N_EMBD, eps=1e-5)
        self.qkv = nn.Linear(N_EMBD, 3 * N_EMBD)
        self.proj = nn.Linear(N_EMBD, N_EMBD)
        self.ln2 = nn.LayerNorm(N_EMBD, eps=1e-5)
        self.fc = nn.Linear(N_EMBD, 4 * N_EMBD)
        self.fcproj = nn.Linear(4 * N_EMBD, N_EMBD)
        self.drop = nn.Dropout(DROPOUT)

    def forward(self, x):
        B, T, C = x.shape
        h = self.ln1(x)
        q, k, v = self.qkv(h).split(C, dim=2)
        hd = C // N_HEAD
        q = q.view(B, T, N_HEAD, hd).transpose(1, 2)
        k = k.view(B, T, N_HEAD, hd).transpose(1, 2)
        v = v.view(B, T, N_HEAD, hd).transpose(1, 2)
        a = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        a = a.transpose(1, 2).contiguous().view(B, T, C)
        x = x + self.drop(self.proj(a))
        h = self.ln2(x)
        h = F.gelu(self.fc(h), approximate="tanh")
        return x + self.drop(self.fcproj(h))


class Nano(nn.Module):
    def __init__(self, vocab: int) -> None:
        super().__init__()
        self.wte = nn.Embedding(vocab, N_EMBD)
        self.wpe = nn.Embedding(BLOCK, N_EMBD)
        self.blocks = nn.ModuleList(Block() for _ in range(N_LAYER))
        self.lnf = nn.LayerNorm(N_EMBD, eps=1e-5)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        pos = torch.arange(T, device=idx.device)
        x = self.wte(idx) + self.wpe(pos)
        for b in self.blocks:
            x = b(x)
        x = self.lnf(x)
        logits = x @ self.wte.weight.T          # tied embeddings
        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        return logits, loss


def quantise(t: torch.Tensor):
    """Per-tensor symmetric int8. Returns (scale, int8 bytes)."""
    peak = t.abs().max().item()
    scale = peak / 127.0 if peak > 0 else 1e-8
    q = torch.clamp(torch.round(t / scale), -127, 127).to(torch.int8)
    return scale, q.numpy().tobytes()


def export(model: Nano, vocab: list, quant: bool, path: pathlib.Path) -> None:
    """Writes the blob. Tensor ORDER is the contract — see nano_model.h."""
    buf = bytearray()
    buf += struct.pack("<IIIIIII", MAGIC, VERSION, len(vocab), BLOCK, N_EMBD,
                       N_HEAD, N_LAYER)
    buf += struct.pack("<I", 1 if quant else 0)
    buf += bytes(vocab)

    def f32(t: torch.Tensor) -> None:
        buf.extend(t.detach().contiguous().float().numpy().tobytes())

    def mat(t: torch.Tensor) -> None:
        # nn.Linear stores [out, in]; the C++ matmul wants [in, out].
        t = t.detach().t().contiguous()
        if quant:
            scale, raw = quantise(t)
            buf.extend(struct.pack("<f", scale))
            buf.extend(raw)
        else:
            f32(t)

    def emb(t: torch.Tensor) -> None:
        t = t.detach().contiguous()
        if quant:
            scale, raw = quantise(t)
            buf.extend(struct.pack("<f", scale))
            buf.extend(raw)
        else:
            f32(t)

    emb(model.wte.weight)          # [V, E]  quantised
    f32(model.wpe.weight)          # [C, E]  always fp32 — small and positional
    for b in model.blocks:
        f32(b.ln1.weight); f32(b.ln1.bias)
        mat(b.qkv.weight); f32(b.qkv.bias)
        mat(b.proj.weight); f32(b.proj.bias)
        f32(b.ln2.weight); f32(b.ln2.bias)
        mat(b.fc.weight); f32(b.fc.bias)
        mat(b.fcproj.weight); f32(b.fcproj.bias)
    f32(model.lnf.weight); f32(model.lnf.bias)

    path.write_bytes(bytes(buf))
    print(f"  wrote {path.relative_to(ROOT)}  {len(buf)/1024:.1f} KB"
          f"  ({'int8' if quant else 'fp32'})")


def main() -> None:
    torch.manual_seed(SEED)
    text = corpus()
    vocab = sorted(set(text))                 # list[int], each 0..255
    stoi = {b: i for i, b in enumerate(vocab)}
    data = torch.tensor([stoi[b] for b in text], dtype=torch.long)
    n = int(0.9 * len(data))
    train, val = data[:n], data[n:]
    print(f"\n  corpus {len(text)/1024:.1f} KB · vocab {len(vocab)} bytes · "
          f"train {len(train)} / val {len(val)} tokens")

    model = Nano(len(vocab))
    params = sum(p.numel() for p in model.parameters())
    print(f"  model  {params/1000:.0f}K parameters, {N_LAYER}L {N_EMBD}d {N_HEAD}h\n")

    def batch(split):
        d = train if split == "train" else val
        ix = torch.randint(len(d) - BLOCK - 1, (BATCH,))
        x = torch.stack([d[i:i + BLOCK] for i in ix])
        y = torch.stack([d[i + 1:i + BLOCK + 1] for i in ix])
        return x, y

    @torch.no_grad()
    def evaluate():
        model.eval()
        out = {}
        for split in ("train", "val"):
            losses = torch.zeros(20)
            for i in range(20):
                x, y = batch(split)
                _, l = model(x, y)
                losses[i] = l.item()
            out[split] = losses.mean().item()
        model.train()
        return out

    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.1)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=STEPS)

    for step in range(STEPS + 1):
        if step % 500 == 0:
            m = evaluate()
            print(f"  step {step:5d}   train {m['train']:.3f}   val {m['val']:.3f}")
        x, y = batch("train")
        _, loss = model(x, y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        sched.step()

    final = evaluate()
    gap = final["val"] - final["train"]
    print(f"\n  final  train {final['train']:.3f}  val {final['val']:.3f}"
          f"  (gap {gap:+.3f})")
    if gap > 0.35:
        print("  note: the gap is the overfit. 66 KB is a small corpus and this\n"
              "        model has more parameters than it has characters to learn\n"
              "        from. The engine is the artefact; the model is a payload.")

    OUT.mkdir(parents=True, exist_ok=True)
    export(model, vocab, quant=False, path=OUT / "nano-fp32.bin")
    export(model, vocab, quant=True, path=OUT / "nano-int8.bin")

    meta = {
        "n_embd": N_EMBD, "n_head": N_HEAD, "n_layer": N_LAYER,
        "block": BLOCK, "vocab": len(vocab), "params": params,
        "trainLoss": round(final["train"], 4), "valLoss": round(final["val"], 4),
        "corpusBytes": len(text),
    }
    import json
    (OUT / "nano-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"  wrote public/nano/nano-meta.json")

    # ---- logit-parity fixture -------------------------------------------
    # The engine is only correct if it produces the SAME logits as the model
    # it was trained from. This dumps a fixed prompt and the reference logits
    # at its last position; engines/nano/test/test_parity.cpp replays the
    # prompt through the C++ (KV cache and all) and diffs them. Without this
    # the C++ can be subtly wrong — a transposed weight, a mis-sliced head —
    # and still produce text that looks vaguely plausible.
    model.eval()
    prompt = "The engine is the artefact"
    ids = [stoi[b] for b in prompt.encode("utf-8") if b in stoi]
    with torch.no_grad():
        logits, _ = model(torch.tensor([ids], dtype=torch.long))
    ref = logits[0, -1].float().contiguous()

    pbuf = bytearray()
    pbuf += struct.pack("<II", len(ids), len(vocab))
    pbuf += struct.pack(f"<{len(ids)}i", *ids)
    pbuf += ref.numpy().tobytes()
    (ROOT / "engines/nano/fixtures/parity.bin").write_bytes(bytes(pbuf))
    print(f"  wrote engines/nano/fixtures/parity.bin  "
          f"({len(ids)} tokens, {len(vocab)} logits)\n")


if __name__ == "__main__":
    sys.exit(main())
