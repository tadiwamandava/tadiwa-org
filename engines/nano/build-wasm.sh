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

# em++, not emcc: emcc links as C, and model.cpp pulls in std::string and
# std::vector, so the C++ runtime has to come along.
em++ -std=c++17 -O3 -msimd128 \
  -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/src/model.cpp engines/nano/src/wasm_api.cpp \
  -s EXPORTED_FUNCTIONS='["_nano_load","_nano_last_error","_nano_n_vocab","_nano_n_ctx","_nano_n_embd","_nano_n_head","_nano_n_layer","_nano_quant","_nano_weight_bytes","_nano_pos","_nano_prime","_nano_next","_nano_token_byte","_nano_op_implemented","_nano_abi_version","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","UTF8ToString","stringToUTF8"]' \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o "$OUT_DIR/nano.mjs"

echo "  wasm: $(wc -c < "$OUT_DIR/nano.wasm") bytes raw, $(gzip -c "$OUT_DIR/nano.wasm" | wc -c) gzip"
echo "  glue: $(wc -c < "$OUT_DIR/nano.mjs") bytes"
