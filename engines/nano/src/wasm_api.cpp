// WebAssembly surface for tadiwa-nano.
//
// Plain `extern "C"` rather than embind: everything crossing this boundary is
// a pointer, a length or an int, and embind would add a JS glue layer and a
// C++ runtime dependency to marshal types we do not have.
//
// One global model. This page runs exactly one engine, and a handle-based API
// would be ceremony around a singleton.
//
// Generation is driven ONE TOKEN AT A TIME from JavaScript rather than looping
// inside WASM. A loop in here would block the main thread for the whole
// completion and the page could neither stream nor be interrupted; stepping
// from JS costs a call per token and buys both.

#include <cstring>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "nano_model.h"
#include "nano_ops.h"

namespace {
nano::Model g_model;
std::vector<float> g_logits;
std::vector<int> g_prompt;
uint64_t g_rng = 0x9E3779B97F4A7C15ULL;
int g_pos = 0;
std::string g_error;
}  // namespace

extern "C" {

/// Parses a weights blob already copied into the WASM heap.
/// Returns 1 on success; on failure returns 0 and nano_last_error() explains.
EMSCRIPTEN_KEEPALIVE
int nano_load(const uint8_t* data, int len) {
  if (!g_model.load(data, static_cast<std::size_t>(len))) {
    g_error = g_model.error();
    return 0;
  }
  g_error.clear();
  g_pos = 0;
  return 1;
}

EMSCRIPTEN_KEEPALIVE
const char* nano_last_error() { return g_error.c_str(); }

EMSCRIPTEN_KEEPALIVE int nano_n_vocab() { return static_cast<int>(g_model.config().n_vocab); }
EMSCRIPTEN_KEEPALIVE int nano_n_ctx()   { return static_cast<int>(g_model.config().n_ctx); }
EMSCRIPTEN_KEEPALIVE int nano_n_embd()  { return static_cast<int>(g_model.config().n_embd); }
EMSCRIPTEN_KEEPALIVE int nano_n_head()  { return static_cast<int>(g_model.config().n_head); }
EMSCRIPTEN_KEEPALIVE int nano_n_layer() { return static_cast<int>(g_model.config().n_layer); }
EMSCRIPTEN_KEEPALIVE int nano_quant()   { return static_cast<int>(g_model.config().quant); }
EMSCRIPTEN_KEEPALIVE int nano_weight_bytes() { return static_cast<int>(g_model.weight_bytes()); }
EMSCRIPTEN_KEEPALIVE int nano_pos() { return g_pos; }

/// Clears the KV cache and consumes `len` bytes of UTF-8 prompt.
/// Returns the number of tokens the prompt encoded to.
EMSCRIPTEN_KEEPALIVE
int nano_prime(const char* text, int len, uint32_t seed) {
  g_model.reset();
  g_pos = 0;
  g_rng = seed ? seed : 0x9E3779B97F4A7C15ULL;
  g_prompt = g_model.encode(std::string(text, static_cast<std::size_t>(len)));
  for (int id : g_prompt) {
    if (g_pos >= static_cast<int>(g_model.config().n_ctx)) break;
    g_model.forward(id, g_pos++, g_logits);
  }
  return static_cast<int>(g_prompt.size());
}

/// Samples the next token, advances the cache, and returns its id.
/// Returns -1 once the context window is full.
EMSCRIPTEN_KEEPALIVE
int nano_next(float temperature, float top_p) {
  if (g_logits.empty()) return -1;
  if (g_pos >= static_cast<int>(g_model.config().n_ctx)) return -1;
  const int id = nano::sample(g_logits, temperature, top_p, g_rng);
  g_model.forward(id, g_pos++, g_logits);
  return id;
}

/// The raw byte a token id maps to. The vocabulary is byte-level, so JS
/// accumulates these and runs them through a streaming TextDecoder — a single
/// id can be one third of a multi-byte character.
EMSCRIPTEN_KEEPALIVE
int nano_token_byte(int id) {
  const std::string s = g_model.decode(id);
  return s.empty() ? -1 : static_cast<unsigned char>(s[0]);
}

// ---- kept for the op-parity demo -----------------------------------------
EMSCRIPTEN_KEEPALIVE
int nano_op_implemented(const char* name) {
  return nano::is_implemented(name) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int nano_abi_version() { return 2; }

}  // extern "C"
