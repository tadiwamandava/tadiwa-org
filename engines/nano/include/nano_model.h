// tadiwa-nano, the model: weight format, forward pass, sampling.
//
// A decoder-only pre-LN transformer, the GPT-2 shape at small scale. The ops in
// nano_ops.h are the arithmetic; this is the wiring that makes them a model.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace nano {

/// On-disk header. Little-endian throughout; the format is self-describing so
/// a stale weights file cannot be silently paired with the wrong config.
///
///   magic "TDNN" | version | n_vocab | n_ctx | n_embd | n_head | n_layer |
///   quant (0 = fp32, 1 = int8 weights) | vocab bytes[n_vocab] | tensors...
///
/// Tensors follow in a fixed order with no names, the order IS the contract,
/// checked by a total-size assertion at load. Names would let a mismatched
/// exporter appear to work while loading the wrong tensor into the right slot.
struct Config {
  uint32_t n_vocab = 0;
  uint32_t n_ctx = 0;
  uint32_t n_embd = 0;
  uint32_t n_head = 0;
  uint32_t n_layer = 0;
  uint32_t quant = 0;
  std::size_t head_dim() const { return n_embd / n_head; }
};

struct Layer {
  const float *ln1_g, *ln1_b;
  const float *qkv_w, *qkv_b;    // (n_embd x 3n_embd), 3n_embd
  const float *proj_w, *proj_b;  // (n_embd x n_embd), n_embd
  const float *ln2_g, *ln2_b;
  const float *fc_w, *fc_b;      // (n_embd x 4n_embd), 4n_embd
  const float *fcproj_w, *fcproj_b;  // (4n_embd x n_embd), n_embd
};

class Model {
 public:
  /// Parses a weights blob. Returns false and sets `error()` rather than
  /// throwing, this runs in WebAssembly, where an exception costs binary size
  /// for a failure the caller has to handle anyway.
  bool load(const uint8_t* data, std::size_t len);

  /// One decode step. `pos` is the absolute position in the sequence; the KV
  /// cache holds everything before it, so this is O(T) per token rather than
  /// O(T^2) for the whole sequence.
  void forward(int token, int pos, std::vector<float>& logits);

  void reset();  // clears the KV cache, i.e. starts a new sequence

  const Config& config() const { return cfg_; }
  const std::string& error() const { return error_; }
  /// Bytes of weights actually resident, after any dequantisation.
  std::size_t weight_bytes() const { return weights_.size() * sizeof(float); }

  // ---- tokenizer: character level, vocabulary carried in the file --------
  std::vector<int> encode(const std::string& text) const;
  std::string decode(int id) const;

 private:
  Config cfg_;
  std::string error_;
  std::vector<float> weights_;   // every tensor, dequantised, one allocation
  std::vector<char> vocab_;      // id -> character
  int byte_to_id_[256];          // character -> id, -1 when absent

  const float* wte_ = nullptr;
  const float* wpe_ = nullptr;
  std::vector<Layer> layers_;
  const float *lnf_g_ = nullptr, *lnf_b_ = nullptr;

  // KV cache, laid out [layer][pos][n_embd]. One allocation, never resized
  // during generation.
  std::vector<float> k_cache_, v_cache_;

  // Per-step scratch. Allocated once at load; a decode step does no heap work.
  std::vector<float> x_, xb_, qkv_, att_, mlp_;
};

/// Sampling. `temperature <= 0` means greedy (argmax).
/// `top_p < 1` restricts to the smallest set whose probability mass reaches p.
int sample(std::vector<float>& logits, float temperature, float top_p,
           uint64_t& rng_state);

}  // namespace nano
