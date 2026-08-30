#!/usr/bin/env bash
# Builds and runs the native op-parity tests. No Emscripten needed, this is
# the fast inner loop while implementing ops; the WASM build is only for the
# browser demo.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."   # repo root, so fixture paths resolve
mkdir -p engines/nano/.build
clang++ -std=c++17 -O2 -Wall -Wextra \
  -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/test/test_ops.cpp \
  -o engines/nano/.build/test_ops
exec engines/nano/.build/test_ops
