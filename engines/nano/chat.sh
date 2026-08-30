#!/usr/bin/env bash
# Generate from the Llama-family engine, natively.
#
# The same code path the browser runs, minus WebAssembly — which makes this the
# place to answer "is the engine wrong, or is the wiring wrong?" whenever the
# page misbehaves.
#
# Usage: npm run chat -- [weights] [tokenizer] [prompt] [n_tokens] [temperature]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p engines/nano/.build

clang++ -std=c++17 -O2 -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/src/model.cpp \
  engines/nano/src/llama.cpp engines/nano/src/bpe.cpp \
  engines/nano/test/cli_llama.cpp \
  -o engines/nano/.build/cli_llama

exec engines/nano/.build/cli_llama "$@"
