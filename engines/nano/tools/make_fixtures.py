"""Golden fixtures for the tadiwa-nano op tests.

This is a test ORACLE, not a reference implementation to copy. It emits inputs
and expected outputs as binary blobs; the C++ under test never sees this code,
and there is nothing here that transliterates into a fast kernel — numpy hides
exactly the loop ordering, blocking and memory layout that the C++ exists to
get right.

Deterministic: a fixed seed, so a fixture regenerated on another machine is
byte-identical and a diff means a real change.

Run: python3 engines/nano/tools/make_fixtures.py
"""

import json
import pathlib
import struct
import numpy as np

OUT = pathlib.Path(__file__).resolve().parents[1] / "fixtures"
RNG = np.random.default_rng(20260827)


def w(name: str, arrays: dict, meta: dict) -> dict:
    """Writes one fixture as a flat f32 blob plus a manifest entry."""
    blob = bytearray()
    layout = []
    for key, arr in arrays.items():
        a = np.ascontiguousarray(arr, dtype=np.float32)
        layout.append({"name": key, "offset": len(blob) // 4, "count": a.size,
                       "shape": list(a.shape)})
        blob += a.tobytes()
    (OUT / f"{name}.bin").write_bytes(bytes(blob))
    return {"name": name, "meta": meta, "layout": layout}


def layernorm(x, g, b, eps):
    mu = x.mean(-1, keepdims=True)
    var = x.var(-1, keepdims=True)           # biased, matches transformers
    return (x - mu) / np.sqrt(var + eps) * g + b


def softmax(x):
    m = x.max(-1, keepdims=True)
    e = np.exp(x - m)
    return e / e.sum(-1, keepdims=True)


def gelu(x):
    return 0.5 * x * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (x + 0.044715 * x**3)))


def attention(q, k, v):
    T, hd = q.shape
    s = q @ k.T / np.sqrt(hd)
    mask = np.triu(np.ones((T, T), dtype=bool), 1)
    s = np.where(mask, -np.inf, s)
    return softmax(s) @ v


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cases = []

    # layernorm — includes a row with a large offset, which is where an
    # unstable implementation shows up.
    n = 64
    x = RNG.normal(0, 1, n).astype(np.float32) * 3.0 + 12.0
    g = RNG.normal(1, 0.1, n).astype(np.float32)
    b = RNG.normal(0, 0.1, n).astype(np.float32)
    cases.append(w("layernorm", {"x": x, "weight": g, "bias": b,
                                 "expected": layernorm(x, g, b, 1e-5)},
                   {"op": "layernorm", "n": n, "eps": 1e-5}))

    # softmax — one element is pinned far above the float32 exp ceiling.
    #
    # This started as `normal(0,1) * 40` and it did NOT catch the bug it was
    # written for: a softmax with no max-subtraction passed, because the
    # sampled maximum happened to land under ~88 where expf still has range.
    # A fixture whose difficulty depends on the draw is not a fixture. The
    # extreme value is now explicit, so an implementation that forgets to
    # subtract the row max overflows to inf/NaN every time.
    n = 128
    x = RNG.normal(0, 1, n).astype(np.float32) * 12.0
    x[73] = 240.0   # expf(240) is inf in float32; expf(240-240) is 1
    cases.append(w("softmax", {"x": x, "expected": softmax(x)},
                   {"op": "softmax", "n": n}))

    # matmul — non-square and non-power-of-two, so an index bug cannot hide
    # behind a symmetric shape.
    M, K, N = 17, 33, 9
    A = RNG.normal(0, 1, (M, K)).astype(np.float32)
    B = RNG.normal(0, 1, (K, N)).astype(np.float32)
    cases.append(w("matmul", {"A": A, "B": B, "expected": A @ B},
                   {"op": "matmul", "M": M, "K": K, "N": N}))

    n = 96
    x = RNG.normal(0, 2, n).astype(np.float32)
    cases.append(w("gelu", {"x": x, "expected": gelu(x)}, {"op": "gelu", "n": n}))

    # matmul_i8 — one column is given a 50x larger range than the rest. With a
    # single per-tensor scale that column dictates the quantisation step and
    # every other column loses most of its resolution; with per-column scales
    # it costs nothing. The fixture is built so the difference is visible.
    M, K, N = 5, 24, 7
    A = RNG.normal(0, 1, (M, K)).astype(np.float32)
    Bf = RNG.normal(0, 1, (K, N)).astype(np.float32)
    Bf[:, 3] *= 50.0
    scales = (np.abs(Bf).max(axis=0) / 127.0).astype(np.float32)
    Bq = np.clip(np.round(Bf / scales), -127, 127).astype(np.int8)
    # Expected is the DEQUANTISED product, not the original — the kernel is
    # exact with respect to the codes it is given, and asserting against Bf
    # would be asserting that quantisation is lossless.
    expected = (A @ Bq.astype(np.float32)) * scales
    cases.append(w("matmul_i8",
                   {"A": A, "codes": Bq.astype(np.float32), "scales": scales,
                    "expected": expected},
                   {"op": "matmul_i8", "M": M, "K": K, "N": N}))

    T, hd = 12, 16
    q = RNG.normal(0, 1, (T, hd)).astype(np.float32)
    k = RNG.normal(0, 1, (T, hd)).astype(np.float32)
    v = RNG.normal(0, 1, (T, hd)).astype(np.float32)
    cases.append(w("attention", {"q": q, "k": k, "v": v,
                                 "expected": attention(q, k, v)},
                   {"op": "attention", "T": T, "head_dim": hd}))

    n = 50
    x = RNG.normal(0, 1, n).astype(np.float32)
    acc = RNG.normal(0, 1, n).astype(np.float32)
    cases.append(w("residual_add", {"x": x, "out": acc, "expected": x + acc},
                   {"op": "residual_add", "n": n}))

    (OUT / "manifest.json").write_text(json.dumps(cases, indent=2) + "\n")
    print(f"  wrote {len(cases)} fixtures to {OUT.relative_to(pathlib.Path.cwd())}")


if __name__ == "__main__":
    main()
