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

NANO_EXPORTS='"_nano_load","_nano_last_error","_nano_n_vocab","_nano_n_ctx","_nano_n_embd","_nano_n_head","_nano_n_layer","_nano_quant","_nano_weight_bytes","_nano_pos","_nano_prime","_nano_next","_nano_token_byte","_nano_op_implemented","_nano_abi_version"'
LLAMA_EXPORTS='"_llama_stage","_llama_commit_tokenizer","_llama_commit_weights","_llama_last_error","_llama_ready","_llama_n_vocab","_llama_n_ctx","_llama_n_embd","_llama_n_head","_llama_n_kv_head","_llama_n_layer","_llama_n_inter","_llama_quant","_llama_pos","_llama_resident_bytes","_llama_kv_bytes","_llama_special","_llama_begin","_llama_prefill_step","_llama_next","_llama_token_bytes"'

# em++, not emcc: emcc links as C, and these sources pull in std::string and
# std::vector, so the C++ runtime has to come along.
#
# INITIAL_MEMORY is deliberately small and MAXIMUM_MEMORY deliberately large.
# The 359K model needs almost nothing; SmolLM2 needs ~180 MB of weights plus a
# ~47 MB KV cache, and only ever if the visitor opts into that download. A
# large INITIAL_MEMORY would make every visitor pay for a model most of them
# will never load.
#
# -fexceptions because llama_stage() catches std::bad_alloc: on a 129 MB
# reservation, running out of memory is a real outcome that has to reach the
# UI as a message rather than as a trap.
em++ -std=c++17 -O3 -msimd128 -fexceptions \
  -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/src/model.cpp \
  engines/nano/src/llama.cpp engines/nano/src/bpe.cpp \
  engines/nano/src/wasm_api.cpp \
  -s EXPORTED_FUNCTIONS="[$NANO_EXPORTS,$LLAMA_EXPORTS,\"_malloc\",\"_free\"]" \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","UTF8ToString","stringToUTF8"]' \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=1073741824 \
  -o "$OUT_DIR/nano.mjs"

echo "  wasm: $(wc -c < "$OUT_DIR/nano.wasm") bytes raw, $(gzip -c "$OUT_DIR/nano.wasm" | wc -c) gzip"
echo "  glue: $(wc -c < "$OUT_DIR/nano.mjs") bytes"
