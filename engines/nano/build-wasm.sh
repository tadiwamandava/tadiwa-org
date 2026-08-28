#!/usr/bin/env bash
# Compiles tadiwa-nano to WebAssembly for the browser demo.
#
# The native test build (build-test.sh) is the loop you want while writing ops;
# this one is only for /lab/inference. -msimd128 is on because the whole point
# of the exercise is the vectorised matmul, and turning SIMD on later would
# change the numbers every earlier measurement was taken against.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

OUT_DIR="public/nano"
mkdir -p "$OUT_DIR" engines/nano/.build

emcc -std=c++17 -O3 -msimd128 \
  -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/src/wasm_api.cpp \
  -s EXPORTED_FUNCTIONS='["_nano_op_implemented","_nano_layernorm","_nano_softmax","_nano_matmul","_nano_gelu","_nano_attention","_nano_abi_version","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF32","HEAPU8"]' \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o "$OUT_DIR/nano.mjs"

echo "  wasm: $(wc -c < "$OUT_DIR/nano.wasm") bytes raw, $(gzip -c "$OUT_DIR/nano.wasm" | wc -c) gzip"
echo "  glue: $(wc -c < "$OUT_DIR/nano.mjs") bytes"
