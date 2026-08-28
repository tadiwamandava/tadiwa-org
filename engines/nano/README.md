# tadiwa-nano

A transformer forward pass in C++, compiled to WebAssembly. **The kernels are
yours to write.** Everything else is already here.

## The loop

```bash
npm run test:nano          # kernels vs golden fixtures        (clang++, ~1s)
npm run test:nano:parity   # whole engine vs PyTorch logits    (~1s)
npm run nano               # generate text and read it         (~1s)
```

Three checks because they catch different things:

- **`test:nano`** proves each kernel in isolation. It cannot see a transposed
  weight or a mis-sliced attention head, because those live above the kernels.
- **`test:nano:parity`** replays a fixed prompt through the entire forward pass,
  KV cache included, and diffs the final logits against the PyTorch model the
  weights came from. This is the one that catches wiring bugs.
- **`npm run nano`** is the human check. A matmul with a subtly wrong stride can
  stay inside tolerance on a 26-token fixture and still produce visible mush
  over 200 tokens.

Pass arguments through with `--`:

```bash
npm run nano -- public/nano/nano-int8.bin "The honest answer is" 300 0.9
```

Then, for each op:

1. Implement it in `src/ops.cpp`.
2. Delete its name from the `kStubbed` list at the top of that file.
3. `npm run test:nano` again. It prints `pass`, or a max absolute error and the
   index of the worst element.

Suggested order — each one leans on the last:

```
residual_add  →  layernorm  →  softmax  →  gelu  →  matmul  →  attention
```

`include/nano_ops.h` states the shape and semantic contract for every op,
including the traps: biased variance in layernorm, max-subtraction in softmax,
the tanh GELU rather than the erf one, and masking before the softmax rather
than after.

## Why the stubs

An interviewer will pick a file in this repo and ask you to walk through it.
These are the files they will pick. Everything around them — the fixture
format, the native test runner, the Emscripten build, the page that renders the
results — is plumbing, and plumbing you did not write costs you nothing.

The fixtures are **data, not code**: inputs and expected outputs in flat f32
blobs. There is no reference implementation in this repository to copy from.
The oracle that produced them (`tools/make_fixtures.py`) is numpy, which hides
exactly the loop ordering, blocking, and memory layout that the C++ exists to
get right.

## Layout

```
include/nano_ops.h     the contract — read this first
src/ops.cpp            YOUR WORK
src/wasm_api.cpp       C ABI for the browser (plumbing)
test/test_ops.cpp      native runner; writes fixtures/report.json
tools/make_fixtures.py numpy oracle; deterministic seed
tools/fixtures.sh      regenerates fixtures in a pinned venv
build-test.sh          clang++ build + run
build-wasm.sh          emcc -O3 -msimd128 → public/nano/
```

`fixtures/report.json` is what `/lab/inference` renders, so the site's progress
page is generated from the real test run and cannot drift from it.

## Regenerating fixtures

```bash
npm run build:fixtures
```

Uses a dedicated venv rather than whatever `python3` currently resolves to —
installing Emscripten via Homebrew pulls in `python@3.14` and silently shadows
the system interpreter, which is how "it worked yesterday" happens.

Fixtures are deterministic (fixed seed), so a regenerated file that differs is
a real change, not noise.

## One fixture worth knowing about

The softmax case started as `normal(0,1) * 40`, intended to catch an
implementation that forgets to subtract the row max. It did not: the sampled
maximum happened to land under the float32 `expf` overflow threshold, and the
buggy version passed cleanly. It now pins one element at `240.0` explicitly,
and the same bug fails with an error of infinity.

A test whose difficulty depends on the random draw is not a test.

## Weights

Not here yet. The ops come first — they are checkable against fixtures without
any model, and a wrong kernel is not worth debugging through a 124M-parameter
forward pass. Once the ops pass, the two paths are converting GPT-2 124M to a
flat binary, or training a small character-level model on this site's own
writing.

## Browser build

```bash
bash engines/nano/build-wasm.sh     # → public/nano/nano.{mjs,wasm}
```

Needs `emcc` (`brew install emscripten`). Not required for the test loop, and
not required to build the site — only for the browser demo, once there is
something to demonstrate.
