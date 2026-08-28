"""Exports SmolLM2's BPE tokeniser into a form C++ can use without a JSON parser.

Two decisions that make the C++ side small:

  1. Each vocabulary entry is stored as the RAW BYTES it decodes to, not as the
     byte-level-unicode string HuggingFace stores. Decoding then becomes a table
     lookup and a memcpy, and the byte<->unicode mapping never has to exist in
     C++ at all.

  2. Merges are stored as (left_id, right_id, result_id) triples rather than as
     string pairs. Rank is the array index. The merge loop becomes a hash lookup
     on a pair of ints instead of string concatenation in an inner loop.

Format (little-endian):
    magic "TDTK" | n_vocab | n_merges
    n_vocab x { u16 len, bytes }
    n_merges x { u32 left, u32 right, u32 result }

Run: engines/nano/tools/.venv/bin/python engines/nano/tools/export_tokenizer.py
"""

import json
import pathlib
import struct
import sys

from huggingface_hub import hf_hub_download
from transformers import AutoTokenizer

MODEL = "HuggingFaceTB/SmolLM2-135M-Instruct"
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "public" / "nano"
MAGIC = 0x4B544454  # "TDTK"


def byte_decoder():
    """Inverse of GPT-2's byte->unicode table."""
    bs = list(range(ord("!"), ord("~") + 1)) + \
         list(range(ord("\xa1"), ord("\xac") + 1)) + \
         list(range(ord("\xae"), ord("\xff") + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return {chr(c): b for b, c in zip(bs, cs)}


def main() -> int:
    tok = AutoTokenizer.from_pretrained(MODEL)
    tjson = json.load(open(hf_hub_download(MODEL, "tokenizer.json")))
    model = tjson["model"]
    vocab = model["vocab"]            # token string -> id
    merges = model["merges"]          # ranked, "a b" or ["a","b"]

    dec = byte_decoder()
    n_vocab = max(vocab.values()) + 1
    by_id = [b""] * n_vocab
    for s, i in vocab.items():
        try:
            by_id[i] = bytes(dec[ch] for ch in s)
        except KeyError:
            # Added/special tokens (<|im_start|> etc.) are not byte-level; keep
            # their literal UTF-8 so decoding round-trips even though they can
            # never be produced by the merge loop.
            by_id[i] = s.encode("utf-8")

    buf = bytearray()
    buf += struct.pack("<III", MAGIC, n_vocab, len(merges))
    for b in by_id:
        buf += struct.pack("<H", len(b)) + b

    n_written = 0
    for m in merges:
        a, b = (m.split(" ", 1) if isinstance(m, str) else (m[0], m[1]))
        if a in vocab and b in vocab and (a + b) in vocab:
            buf += struct.pack("<III", vocab[a], vocab[b], vocab[a + b])
            n_written += 1
    # Rewrite the count with what was actually emitted.
    struct.pack_into("<I", buf, 8, n_written)

    (OUT / "smollm-tokenizer.bin").write_bytes(bytes(buf))
    print(f"\n  vocab   {n_vocab}")
    print(f"  merges  {n_written} of {len(merges)}")
    print(f"  wrote   public/nano/smollm-tokenizer.bin  {len(buf)/1024:.0f} KB")

    # Golden cases for the C++ tokeniser test.
    samples = [
        "The capital of France is",
        "Hello, world!",
        "  leading and trailing  ",
        "def foo(x): return x ** 2",
        "don't  can't  I'll  we've",
        "numbers 1234 and 007 mixed",
        "em—dash, curly “quotes”, arrow → and ⌘K",
        "newlines\nand\ttabs",
        "CamelCase snake_case kebab-case",
        "a",
    ]
    tb = bytearray()
    tb += struct.pack("<I", len(samples))
    for s in samples:
        ids = tok(s, add_special_tokens=False).input_ids
        raw = s.encode("utf-8")
        tb += struct.pack("<HH", len(raw), len(ids)) + raw
        tb += struct.pack(f"<{len(ids)}i", *ids)
    (ROOT / "engines/nano/fixtures/tokenizer-cases.bin").write_bytes(bytes(tb))
    print(f"  wrote   engines/nano/fixtures/tokenizer-cases.bin  "
          f"({len(samples)} cases)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
