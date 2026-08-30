"""Converts a SmolLM2-class HuggingFace model into the nano v3 format.

Two layout traps, both silent if you get them wrong:

  1. `nn.Linear` stores its weight as [out, in]. This engine's matmul wants
     [in, out]. Everything gets transposed. (GPT-2 is the exception — HF's
     Conv1D already stores [in, out] — which is exactly the sort of asymmetry
     that makes "just transpose everything" wrong.)

  2. Matrices are quantised per OUTPUT COLUMN; the embedding table is quantised
     per ROW. The table is used both as a lookup and, tied, as the output
     projection, and a row scale is the only one that serves both.

Also emits a parity fixture — token ids plus the reference logits at the last
position — so the C++ can be checked against this exact model before any
tokeniser exists on the C++ side.

Run: engines/nano/tools/.venv/bin/python engines/nano/tools/convert_smollm.py
"""

import json
import pathlib
import struct
import sys

import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, AutoConfig

MODEL = "HuggingFaceTB/SmolLM2-135M-Instruct"
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "public" / "nano"
FIXTURES = ROOT / "engines" / "nano" / "fixtures"

MAGIC = 0x4E4E4454
VERSION = 3

# The trained maximum is 8192, but the KV cache is
# n_layer * n_ctx * kv_dim * 4 bytes * 2, which at 8192 is ~377 MB on top of a
# 128 MB model. 1024 costs ~47 MB and is far more context than a demo prompt
# will ever use.
N_CTX = 1024

PROMPT = "The capital of France is"


def resolve_rope_theta(cfg) -> float:
    """Finds rope_theta, and REFUSES TO GUESS if it cannot.

    This function exists because of a bug, and the bug is worth recording. The
    first version was `getattr(cfg, "rope_theta", 10000.0)`. In this
    transformers version SmolLM2 carries the value inside `rope_scaling`
    instead of as a top-level attribute, so the getattr missed and the default
    took over — 10000 instead of 100000.

    The resulting engine was exact at position 0 (the rotation angle is zero at
    position 0 whatever theta is) and drifted further wrong with every
    subsequent token. Logits were off by 0.6 in fp32 where they should have
    been off by 1e-5, and the argmax still happened to be right, so the demo
    looked like it worked.

    A default value for a parameter that silently changes the model is not a
    convenience, it is a trap. Raising is the correct behaviour.
    """
    theta = getattr(cfg, "rope_theta", None)
    if theta is None:
        scaling = getattr(cfg, "rope_scaling", None) or {}
        theta = scaling.get("rope_theta")
    if theta is None:
        raise SystemExit(
            "  could not determine rope_theta from the config — refusing to "
            "assume a default, because the wrong value produces a model that "
            "is exact at position 0 and quietly wrong everywhere after it."
        )
    return float(theta)


def q_percol(w: np.ndarray):
    """Per-output-column int8. w is [in, out]; returns (scales[out], codes)."""
    peak = np.abs(w).max(axis=0)
    scales = np.where(peak > 0, peak / 127.0, 1e-8).astype(np.float32)
    codes = np.clip(np.round(w / scales), -127, 127).astype(np.int8)
    return scales, codes


def q_perrow(w: np.ndarray):
    """Per-row int8, for the embedding table. w is [vocab, dim]."""
    peak = np.abs(w).max(axis=1)
    scales = np.where(peak > 0, peak / 127.0, 1e-8).astype(np.float32)
    codes = np.clip(np.round(w / scales[:, None]), -127, 127).astype(np.int8)
    return scales, codes


def main() -> int:
    print(f"\n  loading {MODEL}")
    cfg = AutoConfig.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.float32)
    model.eval()
    sd = {k: v.detach().numpy() for k, v in model.state_dict().items()}

    E = cfg.hidden_size
    I = cfg.intermediate_size
    L = cfg.num_hidden_layers
    H = cfg.num_attention_heads
    KVH = cfg.num_key_value_heads
    V = cfg.vocab_size
    theta = resolve_rope_theta(cfg)
    eps = float(cfg.rms_norm_eps)

    print(f"  {E}d · {L}L · {H}q/{KVH}kv heads · {I} ffn · vocab {V} "
          f"· rope {theta:g} · eps {eps:g}")

    for quant in (True, False):
        buf = bytearray()
        buf += struct.pack("<IIIIIIIII", MAGIC, VERSION, V, N_CTX, E, H, KVH, L, I)
        buf += struct.pack("<I", 1 if quant else 0)
        buf += struct.pack("<ff", theta, eps)
        buf += struct.pack("<II", 0, 0)   # tokenizer_bytes, reserved

        def f32(a):
            buf.extend(np.ascontiguousarray(a, dtype=np.float32).tobytes())

        def mat(name):
            # [out, in] -> [in, out]
            w = np.ascontiguousarray(sd[name].T)
            if quant:
                s, c = q_percol(w)
                buf.extend(s.tobytes())
                buf.extend(c.tobytes())
            else:
                f32(w)

        emb = sd["model.embed_tokens.weight"]        # [V, E]
        if quant:
            s, c = q_perrow(emb)
            buf.extend(s.tobytes())
            buf.extend(c.tobytes())
        else:
            f32(emb)

        for l in range(L):
            p = f"model.layers.{l}."
            f32(sd[p + "input_layernorm.weight"])
            mat(p + "self_attn.q_proj.weight")
            mat(p + "self_attn.k_proj.weight")
            mat(p + "self_attn.v_proj.weight")
            mat(p + "self_attn.o_proj.weight")
            f32(sd[p + "post_attention_layernorm.weight"])
            mat(p + "mlp.gate_proj.weight")
            mat(p + "mlp.up_proj.weight")
            mat(p + "mlp.down_proj.weight")
        f32(sd["model.norm.weight"])

        tag = "int8" if quant else "fp32"
        path = OUT / f"smollm-{tag}.bin"
        path.write_bytes(bytes(buf))
        print(f"  wrote {path.relative_to(ROOT)}  {len(buf)/1048576:.0f} MB  ({tag})")

    # ---- parity fixture --------------------------------------------------
    tok = AutoTokenizer.from_pretrained(MODEL)
    ids = tok(PROMPT, return_tensors="pt").input_ids
    with torch.no_grad():
        ref = model(ids).logits[0, -1].float().numpy()

    pb = bytearray()
    pb += struct.pack("<II", ids.shape[1], V)
    pb += struct.pack(f"<{ids.shape[1]}i", *ids[0].tolist())
    pb += np.ascontiguousarray(ref, dtype=np.float32).tobytes()
    (FIXTURES / "smollm-parity.bin").write_bytes(bytes(pb))

    top = np.argsort(ref)[-5:][::-1]
    print(f"\n  parity fixture: {ids.shape[1]} tokens, prompt {PROMPT!r}")
    print("  reference top-5 next tokens:")
    for t in top:
        print(f"    {t:6d}  {tok.decode([int(t)])!r:14s} logit {ref[t]:.3f}")

    # Tied embeddings appear in state_dict() twice — once as embed_tokens and
    # once as lm_head — and they are the same tensor. Summing sizes naively
    # reports 163M for a model everyone else, including its own name, calls
    # 135M. Deduplicate on storage address.
    seen, n_params = set(), 0
    for v in model.state_dict().values():
        if v.data_ptr() in seen:
            continue
        seen.add(v.data_ptr())
        n_params += v.numel()

    (OUT / "smollm-meta.json").write_text(json.dumps({
        "model": MODEL, "params": int(n_params),
        "n_embd": E, "n_layer": L, "n_head": H, "n_kv_head": KVH,
        "n_inter": I, "vocab": V, "n_ctx": N_CTX,
        "rope_theta": theta, "rms_eps": eps,
    }, indent=2) + "\n")
    print(f"  wrote public/nano/smollm-meta.json\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
