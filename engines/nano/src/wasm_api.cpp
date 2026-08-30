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

#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "nano_bpe.h"
#include "nano_llama.h"
#include "nano_model.h"
#include "nano_ops.h"

namespace {
nano::Model g_model;
std::vector<float> g_logits;
std::vector<int> g_prompt;
uint64_t g_rng = 0x9E3779B97F4A7C15ULL;
int g_pos = 0;
std::string g_error;

// ---- the Llama-family engine ---------------------------------------------
nano::LlamaModel g_llama;
nano::Bpe g_bpe;
bool g_llama_ready = false, g_bpe_ready = false;
std::vector<float> g_ll_logits;
std::vector<int> g_ll_prompt;   ///< prompt ids not yet pushed through the model
std::vector<int> g_ll_recent;   ///< ids emitted so far, for the repetition penalty
std::size_t g_ll_fed = 0;
int g_ll_pos = 0;
uint64_t g_ll_rng = 0x9E3779B97F4A7C15ULL;
std::string g_ll_error;

/// Staging buffer for a streamed download.
///
/// JS asks for `n` bytes, gets a heap pointer, and writes the response body
/// straight into it chunk by chunk. The commit then MOVES it into the model,
/// so a 129 MB weights file is one allocation and zero copies — the obvious
/// alternative (fetch to an ArrayBuffer, then copy across the boundary) peaks
/// at twice that, which is the difference between working and not on a laptop
/// with other tabs open.
std::vector<uint8_t> g_stage;

void release(std::vector<uint8_t>& v) { std::vector<uint8_t>().swap(v); }
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

EMSCRIPTEN_KEEPALIVE int nano_abi_version() { return 3; }

// ==========================================================================
//  The Llama-family engine — SmolLM2 and anything else with the same shape.
// ==========================================================================

/// Reserves `len` bytes in the staging buffer and returns a heap pointer to
/// write into. Returns 0 if the allocation fails, which on a 129 MB model is
/// a real outcome rather than a theoretical one.
EMSCRIPTEN_KEEPALIVE
uint8_t* llama_stage(int len) {
  if (len <= 0) return nullptr;
  release(g_stage);
  try {
    g_stage.resize(static_cast<std::size_t>(len));
  } catch (...) {
    g_ll_error = "out of memory reserving " + std::to_string(len) + " bytes";
    return nullptr;
  }
  return g_stage.data();
}

/// Parses whatever is in the staging buffer as a tokenizer.
EMSCRIPTEN_KEEPALIVE
int llama_commit_tokenizer() {
  g_bpe_ready = g_bpe.load(g_stage.data(), g_stage.size());
  if (!g_bpe_ready) g_ll_error = g_bpe.error();
  release(g_stage);   // Bpe keeps its own structures; the blob is dead here
  return g_bpe_ready ? 1 : 0;
}

/// Parses whatever is in the staging buffer as weights, taking ownership.
EMSCRIPTEN_KEEPALIVE
int llama_commit_weights() {
  g_llama_ready = g_llama.load(std::move(g_stage));
  if (!g_llama_ready) g_ll_error = g_llama.error();
  release(g_stage);
  return g_llama_ready ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE const char* llama_last_error() { return g_ll_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int llama_ready() { return (g_llama_ready && g_bpe_ready) ? 1 : 0; }

EMSCRIPTEN_KEEPALIVE int llama_n_vocab()   { return (int)g_llama.config().n_vocab; }
EMSCRIPTEN_KEEPALIVE int llama_n_ctx()     { return (int)g_llama.config().n_ctx; }
EMSCRIPTEN_KEEPALIVE int llama_n_embd()    { return (int)g_llama.config().n_embd; }
EMSCRIPTEN_KEEPALIVE int llama_n_head()    { return (int)g_llama.config().n_head; }
EMSCRIPTEN_KEEPALIVE int llama_n_kv_head() { return (int)g_llama.config().n_kv_head; }
EMSCRIPTEN_KEEPALIVE int llama_n_layer()   { return (int)g_llama.config().n_layer; }
EMSCRIPTEN_KEEPALIVE int llama_n_inter()   { return (int)g_llama.config().n_inter; }
EMSCRIPTEN_KEEPALIVE int llama_quant()     { return (int)g_llama.config().quant; }
EMSCRIPTEN_KEEPALIVE int llama_pos()       { return g_ll_pos; }

/// Weights + KV cache, in bytes. Reported rather than computed in JS because
/// the KV cache is the half nobody expects, and only the engine knows it.
EMSCRIPTEN_KEEPALIVE int llama_resident_bytes() { return (int)g_llama.resident_bytes(); }
EMSCRIPTEN_KEEPALIVE int llama_kv_bytes()       { return (int)g_llama.kv_bytes(); }

/// Id of an added token — "<|im_end|>" — or -1 if this vocabulary lacks it.
EMSCRIPTEN_KEEPALIVE
int llama_special(const char* text) {
  return g_bpe_ready ? g_bpe.special_id(std::string(text)) : -1;
}

/// Tokenises the prompt and clears the cache. Returns the token count, or -1.
///
/// Nothing is forwarded here. Prefill on a long prompt is seconds of matmul,
/// and doing it in one call would freeze the tab with no way to show progress;
/// llama_prefill_step() below is how it actually gets done.
EMSCRIPTEN_KEEPALIVE
int llama_begin(const char* text, int len, uint32_t seed) {
  if (!g_llama_ready || !g_bpe_ready) { g_ll_error = "engine not loaded"; return -1; }
  g_llama.reset();
  g_ll_pos = 0;
  g_ll_fed = 0;
  g_ll_recent.clear();
  g_ll_rng = seed ? seed : 0x9E3779B97F4A7C15ULL;
  g_ll_prompt = g_bpe.encode(std::string(text, (std::size_t)len));

  // Leave room to actually answer. Truncating the FRONT keeps the most recent
  // turn — and, for a chat template, the assistant header the model needs to
  // see last — which is the opposite of what dropping the tail would do.
  const std::size_t cap = g_llama.config().n_ctx > 64 ? g_llama.config().n_ctx - 64 : 1;
  if (g_ll_prompt.size() > cap) {
    g_ll_prompt.erase(g_ll_prompt.begin(),
                      g_ll_prompt.begin() + (long)(g_ll_prompt.size() - cap));
  }
  return (int)g_ll_prompt.size();
}

/// Pushes one prompt token through the model. Returns how many are left.
EMSCRIPTEN_KEEPALIVE
int llama_prefill_step() {
  if (g_ll_fed >= g_ll_prompt.size()) return 0;
  g_llama.forward(g_ll_prompt[g_ll_fed++], g_ll_pos++, g_ll_logits);
  return (int)(g_ll_prompt.size() - g_ll_fed);
}

/// Samples the next token, advances the cache, returns its id (-1 when the
/// context window is full).
///
/// `repeat_penalty` divides the logit of any token seen in the last 64 emitted
/// — a 135M model with a short context loops without it, and a demo that loops
/// is a demo nobody reads to the end. 1.0 turns it off.
EMSCRIPTEN_KEEPALIVE
int llama_next(float temperature, float top_p, float repeat_penalty) {
  if (!g_llama_ready || g_ll_logits.empty()) return -1;
  if (g_ll_pos >= (int)g_llama.config().n_ctx) return -1;

  if (repeat_penalty > 1.0f && !g_ll_recent.empty()) {
    const std::size_t window = 64;
    const std::size_t from = g_ll_recent.size() > window ? g_ll_recent.size() - window : 0;
    for (std::size_t i = from; i < g_ll_recent.size(); ++i) {
      float& z = g_ll_logits[(std::size_t)g_ll_recent[i]];
      // Divide when positive, multiply when negative — scaling a negative
      // logit by 1/p would make it *more* likely, which is the bug every
      // first implementation of this ships with.
      z = z > 0 ? z / repeat_penalty : z * repeat_penalty;
    }
  }

  const int id = nano::sample(g_ll_logits, temperature, top_p, g_ll_rng);
  g_ll_recent.push_back(id);
  g_llama.forward(id, g_ll_pos++, g_ll_logits);
  return id;
}

/// Copies a token's raw bytes into `out`, returning the length written.
///
/// Not a single byte like nano_token_byte(): this vocabulary is BPE, so one id
/// is usually several bytes and occasionally a partial UTF-8 sequence. JS
/// accumulates and runs a streaming TextDecoder over the result.
EMSCRIPTEN_KEEPALIVE
int llama_token_bytes(int id, uint8_t* out, int cap) {
  if (!g_bpe_ready) return 0;
  const std::string& s = g_bpe.token_bytes(id);
  const int n = (int)std::min<std::size_t>(s.size(), (std::size_t)std::max(0, cap));
  std::memcpy(out, s.data(), (std::size_t)n);
  return n;
}

}  // extern "C"
