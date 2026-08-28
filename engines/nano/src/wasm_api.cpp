// WebAssembly surface for tadiwa-nano.
//
// Plain `extern "C"` exports rather than embind: embind pulls in a sizeable
// JS glue layer and a C++ runtime dependency, and everything crossing this
// boundary is a float pointer and a length. The page allocates through
// _malloc, writes into the heap, and reads results back out.
//
// The ops themselves live in ops.cpp and are unimplemented on purpose. This
// file exists so the build pipeline is proven NOW — when an op lands, the
// browser demo picks it up with no plumbing work.

#include "nano_ops.h"

#include <emscripten/emscripten.h>

extern "C" {

EMSCRIPTEN_KEEPALIVE
int nano_op_implemented(const char* name) {
  return nano::is_implemented(name) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void nano_layernorm(const float* x, const float* w, const float* b, float eps,
                    int n, float* out) {
  nano::layernorm(x, w, b, eps, static_cast<std::size_t>(n), out);
}

EMSCRIPTEN_KEEPALIVE
void nano_softmax(float* x, int n) {
  nano::softmax_inplace(x, static_cast<std::size_t>(n));
}

EMSCRIPTEN_KEEPALIVE
void nano_matmul(const float* A, const float* B, int M, int K, int N, float* C) {
  nano::matmul(A, B, static_cast<std::size_t>(M), static_cast<std::size_t>(K),
               static_cast<std::size_t>(N), C);
}

EMSCRIPTEN_KEEPALIVE
void nano_gelu(float* x, int n) {
  nano::gelu_inplace(x, static_cast<std::size_t>(n));
}

EMSCRIPTEN_KEEPALIVE
void nano_attention(const float* q, const float* k, const float* v, int T,
                    int head_dim, float* out) {
  nano::attention_head(q, k, v, static_cast<std::size_t>(T),
                       static_cast<std::size_t>(head_dim), out);
}

/// Build stamp, so the page can say which engine it is running rather than
/// assuming the .wasm on disk matches the source in the repo.
EMSCRIPTEN_KEEPALIVE
int nano_abi_version() { return 1; }

}  // extern "C"
