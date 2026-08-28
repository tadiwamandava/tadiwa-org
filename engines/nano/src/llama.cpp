#include "nano_llama.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace nano {
namespace {

constexpr uint32_t kMagic = 0x4E4E4454;  // "TDNN"
constexpr uint32_t kVersion = 3;

uint32_t rd32(const uint8_t* p) { uint32_t v; std::memcpy(&v, p, 4); return v; }
float rdf32(const uint8_t* p) { float v; std::memcpy(&v, p, 4); return v; }

}  // namespace

bool LlamaModel::load(std::vector<uint8_t>&& blob) {
  error_.clear();
  blob_ = std::move(blob);
  const uint8_t* d = blob_.data();
  const std::size_t len = blob_.size();

  if (len < 56) { error_ = "blob shorter than its header"; return false; }
  if (rd32(d) != kMagic) { error_ = "bad magic — not a nano weights file"; return false; }
  if (rd32(d + 4) != kVersion) { error_ = "weights version does not match this engine"; return false; }

  cfg_.n_vocab   = rd32(d + 8);
  cfg_.n_ctx     = rd32(d + 12);
  cfg_.n_embd    = rd32(d + 16);
  cfg_.n_head    = rd32(d + 20);
  cfg_.n_kv_head = rd32(d + 24);
  cfg_.n_layer   = rd32(d + 28);
  cfg_.n_inter   = rd32(d + 32);
  cfg_.quant     = rd32(d + 36);
  cfg_.rope_theta = rdf32(d + 40);
  cfg_.rms_eps    = rdf32(d + 44);
  const uint32_t tokenizer_bytes = rd32(d + 48);
  // d + 52 reserved

  if (cfg_.n_head == 0 || cfg_.n_kv_head == 0 ||
      cfg_.n_embd % cfg_.n_head != 0 || cfg_.n_head % cfg_.n_kv_head != 0) {
    error_ = "head configuration is inconsistent";
    return false;
  }

  std::size_t off = 56 + tokenizer_bytes;   // tokenizer blob is read elsewhere
  if (off > len) { error_ = "truncated before the weights"; return false; }

  const std::size_t E = cfg_.n_embd, I = cfg_.n_inter, V = cfg_.n_vocab,
                    HD = cfg_.head_dim(), KV = cfg_.kv_dim();
  const bool q8 = cfg_.quant == 1;

  // Walks the payload in the fixed tensor order. Every read is bounds-checked
  // against `len`, so a truncated or mismatched file fails here rather than
  // reading past the end of the mapping at inference time.
  bool ok = true;
  auto take_f32 = [&](std::size_t n) -> const float* {
    if (!ok || off + n * 4 > len) { ok = false; return nullptr; }
    const float* p = reinterpret_cast<const float*>(d + off);
    off += n * 4;
    return p;
  };
  auto take_mat = [&](std::size_t in, std::size_t out) -> QMat {
    QMat m; m.in = in; m.out = out;
    if (q8) {
      m.scales = take_f32(out);
      if (!ok || off + in * out > len) { ok = false; return m; }
      m.q = reinterpret_cast<const int8_t*>(d + off);
      off += in * out;
    } else {
      m.f = take_f32(in * out);
    }
    return m;
  };

  // Embeddings: per-ROW scales, so `out` here is the vocabulary.
  if (q8) {
    embed_s_ = take_f32(V);
    if (ok && off + V * E <= len) {
      embed_q_ = reinterpret_cast<const int8_t*>(d + off);
      off += V * E;
    } else ok = false;
  } else {
    embed_f_ = take_f32(V * E);
  }

  layers_.assign(cfg_.n_layer, LlamaLayer{});
  for (uint32_t l = 0; ok && l < cfg_.n_layer; ++l) {
    LlamaLayer& ly = layers_[l];
    ly.attn_norm = take_f32(E);
    ly.q = take_mat(E, E);
    ly.k = take_mat(E, KV);
    ly.v = take_mat(E, KV);
    ly.o = take_mat(E, E);
    ly.ffn_norm = take_f32(E);
    ly.gate = take_mat(E, I);
    ly.up = take_mat(E, I);
    ly.down = take_mat(I, E);
  }
  final_norm_ = take_f32(E);

  if (!ok || off != len) {
    error_ = "weights payload does not match the declared architecture";
    return false;
  }

  k_cache_.assign(static_cast<std::size_t>(cfg_.n_layer) * cfg_.n_ctx * KV, 0.0f);
  v_cache_.assign(k_cache_.size(), 0.0f);
  x_.assign(E, 0.0f);   xb_.assign(E, 0.0f);
  q_.assign(E, 0.0f);   kbuf_.assign(KV, 0.0f);  vbuf_.assign(KV, 0.0f);
  attn_.assign(E, 0.0f);
  gate_.assign(I, 0.0f); up_.assign(I, 0.0f);
  (void)HD;
  return true;
}

void LlamaModel::reset() {
  std::fill(k_cache_.begin(), k_cache_.end(), 0.0f);
  std::fill(v_cache_.begin(), v_cache_.end(), 0.0f);
}

void LlamaModel::forward(int token, int pos, std::vector<float>& logits) {
  const std::size_t E = cfg_.n_embd, I = cfg_.n_inter, V = cfg_.n_vocab,
                    H = cfg_.n_head, KVH = cfg_.n_kv_head, HD = cfg_.head_dim(),
                    KV = cfg_.kv_dim(), G = cfg_.group(), C = cfg_.n_ctx;
  if (token < 0 || static_cast<uint32_t>(token) >= V) token = 0;
  if (pos < 0 || static_cast<std::size_t>(pos) >= C) return;

  // ---- embedding lookup -------------------------------------------------
  if (embed_q_) {
    const int8_t* row = embed_q_ + static_cast<std::size_t>(token) * E;
    const float s = embed_s_[token];
    for (std::size_t i = 0; i < E; ++i) x_[i] = static_cast<float>(row[i]) * s;
  } else {
    std::memcpy(x_.data(), embed_f_ + static_cast<std::size_t>(token) * E, E * sizeof(float));
  }
  // No positional table: RoPE injects position inside attention instead.

  if (trace_on_) { trace_.clear(); trace_.push_back(x_); }

  for (std::size_t l = 0; l < layers_.size(); ++l) {
    const LlamaLayer& ly = layers_[l];

    // ---- attention ------------------------------------------------------
    rmsnorm(x_.data(), ly.attn_norm, cfg_.rms_eps, E, xb_.data());
    ly.q.apply(xb_.data(), q_.data());
    ly.k.apply(xb_.data(), kbuf_.data());
    ly.v.apply(xb_.data(), vbuf_.data());

    // RoPE goes on q and k but NOT v. v carries content, not position;
    // rotating it corrupts the values the attention is averaging.
    for (std::size_t h = 0; h < H; ++h)
      rope_inplace(q_.data() + h * HD, HD, pos, cfg_.rope_theta);
    for (std::size_t h = 0; h < KVH; ++h)
      rope_inplace(kbuf_.data() + h * HD, HD, pos, cfg_.rope_theta);

    float* k_layer = k_cache_.data() + l * C * KV;
    float* v_layer = v_cache_.data() + l * C * KV;
    std::memcpy(k_layer + static_cast<std::size_t>(pos) * KV, kbuf_.data(), KV * sizeof(float));
    std::memcpy(v_layer + static_cast<std::size_t>(pos) * KV, vbuf_.data(), KV * sizeof(float));

    const float scale = 1.0f / std::sqrt(static_cast<float>(HD));
    std::vector<float> scores(static_cast<std::size_t>(pos) + 1);

    for (std::size_t h = 0; h < H; ++h) {
      // Grouped-query attention: query head h reads KV head h / G. With 9 query
      // heads over 3 KV heads, heads 0-2 share KV head 0, and so on — the KV
      // cache is a third the size it would be with full multi-head attention,
      // which is most of why long contexts are affordable.
      const std::size_t kvh = h / G;
      const float* qh = q_.data() + h * HD;

      for (std::size_t t = 0; t <= static_cast<std::size_t>(pos); ++t) {
        const float* kh = k_layer + t * KV + kvh * HD;
        float dot = 0.0f;
        for (std::size_t i = 0; i < HD; ++i) dot += qh[i] * kh[i];
        scores[t] = dot * scale;
      }
      softmax_inplace(scores.data(), static_cast<std::size_t>(pos) + 1);

      float* oh = attn_.data() + h * HD;
      for (std::size_t i = 0; i < HD; ++i) oh[i] = 0.0f;
      for (std::size_t t = 0; t <= static_cast<std::size_t>(pos); ++t) {
        const float w = scores[t];
        const float* vh = v_layer + t * KV + kvh * HD;
        for (std::size_t i = 0; i < HD; ++i) oh[i] += w * vh[i];
      }
    }

    ly.o.apply(attn_.data(), xb_.data());
    residual_add(xb_.data(), E, x_.data());

    // ---- SwiGLU feed-forward -------------------------------------------
    // down( silu(gate(x)) * up(x) ) — two parallel projections, one gating the
    // other elementwise. That is the whole difference from GPT-2's single
    // fc -> GELU -> proj, and it is why the intermediate width is 1536 rather
    // than 4x the model dimension.
    rmsnorm(x_.data(), ly.ffn_norm, cfg_.rms_eps, E, xb_.data());
    ly.gate.apply(xb_.data(), gate_.data());
    ly.up.apply(xb_.data(), up_.data());
    silu_inplace(gate_.data(), I);
    for (std::size_t i = 0; i < I; ++i) gate_[i] *= up_[i];
    ly.down.apply(gate_.data(), xb_.data());
    residual_add(xb_.data(), E, x_.data());

    if (trace_on_) trace_.push_back(x_);
  }

  rmsnorm(x_.data(), final_norm_, cfg_.rms_eps, E, xb_.data());

  // Tied embeddings: logit v is the dot of the final hidden state with row v
  // of the embedding table.
  logits.assign(V, 0.0f);
  if (embed_q_) {
    for (std::size_t v = 0; v < V; ++v) {
      const int8_t* row = embed_q_ + v * E;
      float dot = 0.0f;
      for (std::size_t i = 0; i < E; ++i) dot += xb_[i] * static_cast<float>(row[i]);
      logits[v] = dot * embed_s_[v];
    }
  } else {
    for (std::size_t v = 0; v < V; ++v) {
      const float* row = embed_f_ + v * E;
      float dot = 0.0f;
      for (std::size_t i = 0; i < E; ++i) dot += xb_[i] * row[i];
      logits[v] = dot;
    }
  }
}

}  // namespace nano
