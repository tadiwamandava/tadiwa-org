#include "nano_model.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#include "nano_ops.h"

namespace nano {
namespace {

constexpr uint32_t kMagic = 0x4E4E4454;  // "TDNN" little-endian
constexpr uint32_t kVersion = 1;

uint32_t rd32(const uint8_t* p) {
  uint32_t v;
  std::memcpy(&v, p, 4);
  return v;
}

}  // namespace

bool Model::load(const uint8_t* data, std::size_t len) {
  error_.clear();
  if (len < 32) {
    error_ = "weights blob is shorter than its header";
    return false;
  }
  if (rd32(data) != kMagic) {
    error_ = "bad magic — this is not a nano weights file";
    return false;
  }
  if (rd32(data + 4) != kVersion) {
    error_ = "weights file version does not match this engine";
    return false;
  }

  cfg_.n_vocab = rd32(data + 8);
  cfg_.n_ctx = rd32(data + 12);
  cfg_.n_embd = rd32(data + 16);
  cfg_.n_head = rd32(data + 20);
  cfg_.n_layer = rd32(data + 24);
  cfg_.quant = rd32(data + 28);

  if (cfg_.n_head == 0 || cfg_.n_embd % cfg_.n_head != 0) {
    error_ = "n_embd is not divisible by n_head";
    return false;
  }

  std::size_t off = 32;
  if (off + cfg_.n_vocab > len) {
    error_ = "truncated before the vocabulary";
    return false;
  }
  vocab_.assign(reinterpret_cast<const char*>(data + off),
                reinterpret_cast<const char*>(data + off + cfg_.n_vocab));
  off += cfg_.n_vocab;

  for (int i = 0; i < 256; ++i) byte_to_id_[i] = -1;
  for (std::size_t i = 0; i < vocab_.size(); ++i) {
    byte_to_id_[static_cast<unsigned char>(vocab_[i])] = static_cast<int>(i);
  }

  const std::size_t E = cfg_.n_embd, L = cfg_.n_layer, V = cfg_.n_vocab,
                    C = cfg_.n_ctx;

  // Expected element count, in tensor order. Asserting the total is what makes
  // an unnamed format safe: an exporter that emits the right tensors in the
  // wrong order still fails here rather than producing quiet nonsense.
  const std::size_t per_layer = 2 * E            // ln1 g,b
                                + E * 3 * E + 3 * E   // qkv
                                + E * E + E           // proj
                                + 2 * E               // ln2 g,b
                                + E * 4 * E + 4 * E   // fc
                                + 4 * E * E + E;      // fcproj
  const std::size_t total = V * E + C * E + L * per_layer + 2 * E;

  // fp32: 4 bytes each. int8: 1 byte per weight-matrix element plus one f32
  // scale per tensor; biases and layernorm parameters stay fp32 because they
  // are tiny and quantising them costs accuracy for no meaningful saving.
  weights_.resize(total);

  if (cfg_.quant == 0) {
    if (off + total * 4 != len) {
      error_ = "weights blob size does not match the declared architecture";
      return false;
    }
    std::memcpy(weights_.data(), data + off, total * 4);
  } else if (cfg_.quant == 1) {
    // Dequantise on load. The int8 saving here is on the WIRE — a 4x smaller
    // download — not in resident memory. Keeping int8 in RAM would need an
    // int8 matmul kernel, which is the next rung of the ladder rather than a
    // free win, and pretending otherwise would make the memory figure a lie.
    std::size_t p = off;
    std::size_t w = 0;
    auto take_f32 = [&](std::size_t n) -> bool {
      if (p + n * 4 > len) return false;
      std::memcpy(weights_.data() + w, data + p, n * 4);
      p += n * 4;
      w += n;
      return true;
    };
    auto take_i8 = [&](std::size_t n) -> bool {
      if (p + 4 + n > len) return false;
      float scale;
      std::memcpy(&scale, data + p, 4);
      p += 4;
      for (std::size_t i = 0; i < n; ++i) {
        weights_[w + i] = static_cast<float>(static_cast<int8_t>(data[p + i])) * scale;
      }
      p += n;
      w += n;
      return true;
    };

    bool ok = take_i8(V * E) && take_f32(C * E);
    for (std::size_t l = 0; ok && l < L; ++l) {
      ok = take_f32(2 * E) && take_i8(E * 3 * E) && take_f32(3 * E) &&
           take_i8(E * E) && take_f32(E) && take_f32(2 * E) &&
           take_i8(E * 4 * E) && take_f32(4 * E) && take_i8(4 * E * E) &&
           take_f32(E);
    }
    ok = ok && take_f32(2 * E);
    if (!ok || p != len || w != total) {
      error_ = "quantised weights blob is inconsistent with its header";
      return false;
    }
  } else {
    error_ = "unknown quantisation mode";
    return false;
  }

  // Bind views into the single allocation, in the same fixed order.
  const float* q = weights_.data();
  wte_ = q; q += V * E;
  wpe_ = q; q += C * E;

  layers_.clear();
  layers_.reserve(L);
  for (std::size_t l = 0; l < L; ++l) {
    Layer ly{};
    ly.ln1_g = q; q += E;
    ly.ln1_b = q; q += E;
    ly.qkv_w = q; q += E * 3 * E;
    ly.qkv_b = q; q += 3 * E;
    ly.proj_w = q; q += E * E;
    ly.proj_b = q; q += E;
    ly.ln2_g = q; q += E;
    ly.ln2_b = q; q += E;
    ly.fc_w = q; q += E * 4 * E;
    ly.fc_b = q; q += 4 * E;
    ly.fcproj_w = q; q += 4 * E * E;
    ly.fcproj_b = q; q += E;
    layers_.push_back(ly);
  }
  lnf_g_ = q; q += E;
  lnf_b_ = q; q += E;

  k_cache_.assign(L * C * E, 0.0f);
  v_cache_.assign(L * C * E, 0.0f);
  x_.assign(E, 0.0f);
  xb_.assign(E, 0.0f);
  qkv_.assign(3 * E, 0.0f);
  att_.assign(E, 0.0f);
  mlp_.assign(4 * E, 0.0f);
  return true;
}

void Model::reset() {
  std::fill(k_cache_.begin(), k_cache_.end(), 0.0f);
  std::fill(v_cache_.begin(), v_cache_.end(), 0.0f);
}

void Model::forward(int token, int pos, std::vector<float>& logits) {
  const std::size_t E = cfg_.n_embd, H = cfg_.n_head, HD = cfg_.head_dim(),
                    C = cfg_.n_ctx, V = cfg_.n_vocab;
  if (token < 0 || static_cast<uint32_t>(token) >= V) token = 0;
  if (pos < 0 || static_cast<uint32_t>(pos) >= C) return;

  // token embedding + learned positional embedding
  for (std::size_t i = 0; i < E; ++i) {
    x_[i] = wte_[static_cast<std::size_t>(token) * E + i] + wpe_[static_cast<std::size_t>(pos) * E + i];
  }

  for (std::size_t l = 0; l < layers_.size(); ++l) {
    const Layer& ly = layers_[l];

    // ---- attention block (pre-LN: normalise the input, add the output) ----
    layernorm(x_.data(), ly.ln1_g, ly.ln1_b, 1e-5f, E, xb_.data());

    // One fused (1 x E) @ (E x 3E) instead of three separate projections:
    // same arithmetic, one pass over xb_, and the weight rows for q, k and v
    // for a given output channel end up adjacent in memory.
    matmul(xb_.data(), ly.qkv_w, 1, E, 3 * E, qkv_.data());
    for (std::size_t i = 0; i < 3 * E; ++i) qkv_[i] += ly.qkv_b[i];

    // Append this step's K and V to the cache. This is the whole point of the
    // cache: every earlier position's K and V are already here, so a decode
    // step attends over the prefix without recomputing it.
    float* k_layer = k_cache_.data() + l * C * E;
    float* v_layer = v_cache_.data() + l * C * E;
    std::memcpy(k_layer + static_cast<std::size_t>(pos) * E, qkv_.data() + E, E * sizeof(float));
    std::memcpy(v_layer + static_cast<std::size_t>(pos) * E, qkv_.data() + 2 * E, E * sizeof(float));

    const float scale = 1.0f / std::sqrt(static_cast<float>(HD));
    std::vector<float> scores(static_cast<std::size_t>(pos) + 1);

    for (std::size_t h = 0; h < H; ++h) {
      const float* qh = qkv_.data() + h * HD;
      for (std::size_t t = 0; t <= static_cast<std::size_t>(pos); ++t) {
        const float* kh = k_layer + t * E + h * HD;
        float dot = 0.0f;
        for (std::size_t d = 0; d < HD; ++d) dot += qh[d] * kh[d];
        scores[t] = dot * scale;
      }
      // Causal masking is implicit: only positions 0..pos exist in the cache,
      // so there is nothing after the current step to mask out.
      softmax_inplace(scores.data(), static_cast<std::size_t>(pos) + 1);

      float* oh = att_.data() + h * HD;
      for (std::size_t d = 0; d < HD; ++d) oh[d] = 0.0f;
      for (std::size_t t = 0; t <= static_cast<std::size_t>(pos); ++t) {
        const float w = scores[t];
        const float* vh = v_layer + t * E + h * HD;
        for (std::size_t d = 0; d < HD; ++d) oh[d] += w * vh[d];
      }
    }

    matmul(att_.data(), ly.proj_w, 1, E, E, xb_.data());
    for (std::size_t i = 0; i < E; ++i) xb_[i] += ly.proj_b[i];
    residual_add(xb_.data(), E, x_.data());

    // ---- MLP block ------------------------------------------------------
    layernorm(x_.data(), ly.ln2_g, ly.ln2_b, 1e-5f, E, xb_.data());
    matmul(xb_.data(), ly.fc_w, 1, E, 4 * E, mlp_.data());
    for (std::size_t i = 0; i < 4 * E; ++i) mlp_[i] += ly.fc_b[i];
    gelu_inplace(mlp_.data(), 4 * E);
    matmul(mlp_.data(), ly.fcproj_w, 1, 4 * E, E, xb_.data());
    for (std::size_t i = 0; i < E; ++i) xb_[i] += ly.fcproj_b[i];
    residual_add(xb_.data(), E, x_.data());
  }

  layernorm(x_.data(), lnf_g_, lnf_b_, 1e-5f, E, xb_.data());

  // Tied embeddings: the output projection is wte transposed, so logit v is
  // just dot(x, wte[v]). Saves V*E parameters and is what GPT-2 does.
  logits.assign(V, 0.0f);
  for (std::size_t v = 0; v < V; ++v) {
    const float* row = wte_ + v * E;
    float dot = 0.0f;
    for (std::size_t i = 0; i < E; ++i) dot += xb_[i] * row[i];
    logits[v] = dot;
  }
}

std::vector<int> Model::encode(const std::string& text) const {
  std::vector<int> out;
  out.reserve(text.size());
  for (unsigned char c : text) {
    const int id = byte_to_id_[c];
    if (id >= 0) out.push_back(id);
    // Characters outside the trained vocabulary are dropped rather than mapped
    // to a substitute: a silent replacement would put the model in a state its
    // training never produced.
  }
  return out;
}

std::string Model::decode(int id) const {
  if (id < 0 || static_cast<std::size_t>(id) >= vocab_.size()) return "";
  return std::string(1, vocab_[static_cast<std::size_t>(id)]);
}

// ---------------------------------------------------------------------------

int sample(std::vector<float>& logits, float temperature, float top_p,
           uint64_t& rng_state) {
  const std::size_t n = logits.size();
  if (n == 0) return 0;

  if (temperature <= 0.0f) {
    return static_cast<int>(std::max_element(logits.begin(), logits.end()) -
                            logits.begin());
  }

  for (float& v : logits) v /= temperature;
  softmax_inplace(logits.data(), n);

  // xorshift64*, so a seed reproduces a sample exactly. Reproducibility matters
  // more here than statistical quality: a demo that cannot be replayed cannot
  // be debugged.
  rng_state ^= rng_state >> 12;
  rng_state ^= rng_state << 25;
  rng_state ^= rng_state >> 27;
  const float r = static_cast<float>((rng_state * 0x2545F4914F6CDD1DULL) >> 40) /
                  static_cast<float>(1 << 24);

  if (top_p >= 1.0f) {
    float acc = 0.0f;
    for (std::size_t i = 0; i < n; ++i) {
      acc += logits[i];
      if (r < acc) return static_cast<int>(i);
    }
    return static_cast<int>(n - 1);
  }

  // Nucleus: keep the smallest prefix of the sorted distribution whose mass
  // reaches top_p, then sample within it.
  std::vector<std::size_t> idx(n);
  for (std::size_t i = 0; i < n; ++i) idx[i] = i;
  std::sort(idx.begin(), idx.end(),
            [&](std::size_t a, std::size_t b) { return logits[a] > logits[b]; });

  float mass = 0.0f;
  std::size_t cutoff = n;
  for (std::size_t i = 0; i < n; ++i) {
    mass += logits[idx[i]];
    if (mass >= top_p) {
      cutoff = i + 1;
      break;
    }
  }

  const float target = r * mass;
  float acc = 0.0f;
  for (std::size_t i = 0; i < cutoff; ++i) {
    acc += logits[idx[i]];
    if (target < acc) return static_cast<int>(idx[i]);
  }
  return static_cast<int>(idx[cutoff - 1]);
}

}  // namespace nano
