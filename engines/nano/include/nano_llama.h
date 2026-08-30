// tadiwa-nano, the Llama-family engine.
//
// Runs SmolLM2-class models: RMSNorm, RoPE, SwiGLU, grouped-query attention,
// tied embeddings, no biases. That is the shape essentially every open model
// released since 2023 uses, and it is different enough from GPT-2 that it gets
// its own forward pass rather than a pile of flags in the old one.
//
// WEIGHTS STAY PACKED. int8 codes are read straight out of the mapped file and
// multiplied by matmul_i8; nothing is dequantised into a parallel fp32 buffer.
// For a 135M model that is the difference between ~128 MB resident and ~513 MB,
// and only one of those numbers fits in a browser tab.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "nano_ops.h"

namespace nano {

/// A weight matrix, fp32 or int8-with-per-column-scales, behind one call.
/// The branch lives here once instead of at every use site.
struct QMat {
  const float* f = nullptr;
  const int8_t* q = nullptr;
  const float* scales = nullptr;
  std::size_t in = 0, out = 0;

  /// row (1 x in) -> dst (1 x out)
  void apply(const float* row, float* dst) const {
    if (q) matmul_i8(row, q, scales, 1, in, out, dst);
    else matmul(row, f, 1, in, out, dst);
  }
};

struct LlamaConfig {
  uint32_t n_vocab = 0;
  uint32_t n_ctx = 0;       ///< capped at export time; bounds the KV cache
  uint32_t n_embd = 0;
  uint32_t n_head = 0;
  uint32_t n_kv_head = 0;   ///< < n_head means grouped-query attention
  uint32_t n_layer = 0;
  uint32_t n_inter = 0;     ///< SwiGLU intermediate width
  uint32_t quant = 0;       ///< 0 = fp32 matrices, 1 = int8 + per-column scales
  float rope_theta = 10000.0f;
  float rms_eps = 1e-5f;

  std::size_t head_dim() const { return n_embd / n_head; }
  /// How many query heads share one KV head.
  std::size_t group() const { return n_head / n_kv_head; }
  std::size_t kv_dim() const { return n_kv_head * head_dim(); }
};

struct LlamaLayer {
  const float* attn_norm = nullptr;
  QMat q, k, v, o;
  const float* ffn_norm = nullptr;
  QMat gate, up, down;
};

class LlamaModel {
 public:
  bool load(std::vector<uint8_t>&& blob);
  void reset();
  /// One decode step at absolute position `pos`. Fills `logits` (n_vocab).
  void forward(int token, int pos, std::vector<float>& logits);

  /// Captures the residual stream after every layer, for bisecting a
  /// divergence against a reference. Off by default; costs an allocation per
  /// layer when on.
  void set_trace(bool on) { trace_on_ = on; }
  const std::vector<std::vector<float>>& trace() const { return trace_; }

  const LlamaConfig& config() const { return cfg_; }
  const std::string& error() const { return error_; }
  std::size_t resident_bytes() const { return blob_.size() + kv_bytes(); }
  std::size_t kv_bytes() const {
    return (k_cache_.size() + v_cache_.size()) * sizeof(float);
  }

 private:
  LlamaConfig cfg_;
  std::string error_;
  /// The file itself, kept alive. Every pointer below is a view into it, so a
  /// 128 MB model costs one allocation and zero copies.
  std::vector<uint8_t> blob_;

  // Token embeddings, quantised per ROW. Per-row rather than per-column
  // because this table is read two ways, a row lookup on input and a row
  // dot-product for the tied output projection, and only a row scale serves
  // both without a second copy.
  const float* embed_f_ = nullptr;
  const int8_t* embed_q_ = nullptr;
  const float* embed_s_ = nullptr;

  std::vector<LlamaLayer> layers_;
  const float* final_norm_ = nullptr;

  bool trace_on_ = false;
  std::vector<std::vector<float>> trace_;

  std::vector<float> k_cache_, v_cache_;   // [layer][pos][kv_dim]
  std::vector<float> x_, xb_, q_, kbuf_, vbuf_, attn_, gate_, up_;
};

}  // namespace nano
