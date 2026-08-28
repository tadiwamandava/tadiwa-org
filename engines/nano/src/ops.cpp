// tadiwa-nano — op implementations.
//
// Read include/nano_ops.h first: it states the shape and semantic contract for
// each of these, including the traps. Everything here is checked against golden
// fixtures by `npm run test:nano`.
//
// These are written to be read. Where there is a choice, the comment says what
// the alternative was and why it lost — the same standard the project writeups
// on this site are held to.

#include "nano_ops.h"

#include <cmath>
#include <cstring>
#include <vector>

namespace nano {
namespace {

// Nothing is stubbed any more. Kept (rather than deleted) because the test
// runner distinguishes "not started" from "wrong", and that distinction is
// worth preserving if an op is ever pulled out to be rewritten.
const char* kStubbed[] = {nullptr};

}  // namespace

bool is_implemented(const char* op_name) {
  for (const char* s : kStubbed) {
    if (s != nullptr && std::strcmp(s, op_name) == 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------

void layernorm(const float* x, const float* weight, const float* bias,
               float eps, std::size_t n, float* out) {
  // Two passes, not one. The single-pass "sum and sum-of-squares" trick
  // computes variance as E[x^2] - E[x]^2, which catastrophically cancels when
  // the mean is large relative to the spread — exactly the case in a deep
  // residual stream, where activations drift far from zero. Two passes cost
  // one extra read of a row that is already in L1.
  float mean = 0.0f;
  for (std::size_t i = 0; i < n; ++i) mean += x[i];
  mean /= static_cast<float>(n);

  float var = 0.0f;
  for (std::size_t i = 0; i < n; ++i) {
    const float d = x[i] - mean;
    var += d * d;
  }
  var /= static_cast<float>(n);  // biased — matches every transformer impl

  const float inv = 1.0f / std::sqrt(var + eps);
  for (std::size_t i = 0; i < n; ++i) {
    out[i] = (x[i] - mean) * inv * weight[i] + bias[i];
  }
  // Safe in place: every read of x[i] happens before the write to out[i] in
  // the same iteration, and mean/var were already materialised.
}

void softmax_inplace(float* x, std::size_t n) {
  if (n == 0) return;

  // Subtracting the max is not an optimisation, it is the difference between
  // working and returning NaN. expf overflows above ~88, and attention logits
  // routinely exceed that. Subtracting a constant leaves the result unchanged
  // because it cancels between numerator and denominator.
  float max_v = x[0];
  for (std::size_t i = 1; i < n; ++i) {
    if (x[i] > max_v) max_v = x[i];
  }

  float sum = 0.0f;
  for (std::size_t i = 0; i < n; ++i) {
    x[i] = std::exp(x[i] - max_v);
    sum += x[i];
  }

  // A fully-masked row would sum to zero; guard rather than emit NaN.
  const float inv = sum > 0.0f ? 1.0f / sum : 0.0f;
  for (std::size_t i = 0; i < n; ++i) x[i] *= inv;
}

void matmul(const float* A, const float* B, std::size_t M, std::size_t K,
            std::size_t N, float* C) {
  // Loop order i-k-j, not the textbook i-j-k.
  //
  // With i-j-k the inner loop walks B down a column, striding N floats per
  // step, so every access is a fresh cache line. With i-k-j the inner loop
  // walks a ROW of B and a row of C contiguously, which is both cache-friendly
  // and auto-vectorisable — the compiler turns it into SIMD without help.
  // Same arithmetic, same result, several times faster.
  //
  // This is the first rung of the ladder. Blocking and explicit SIMD come
  // next, and PERFORMANCE.md is where each one's measured gain goes.
  for (std::size_t i = 0; i < M; ++i) {
    float* c_row = C + i * N;
    for (std::size_t j = 0; j < N; ++j) c_row[j] = 0.0f;

    for (std::size_t k = 0; k < K; ++k) {
      const float a = A[i * K + k];
      if (a == 0.0f) continue;  // cheap, and common after ReLU-like activations
      const float* b_row = B + k * N;
      for (std::size_t j = 0; j < N; ++j) c_row[j] += a * b_row[j];
    }
  }
}

void gelu_inplace(float* x, std::size_t n) {
  // The tanh approximation, because that is what GPT-2's weights were trained
  // against. The exact erf form is a different function; swapping it in shifts
  // every activation slightly and the logits will not match a reference.
  constexpr float kSqrt2OverPi = 0.7978845608028654f;
  constexpr float kCoeff = 0.044715f;
  for (std::size_t i = 0; i < n; ++i) {
    const float v = x[i];
    const float inner = kSqrt2OverPi * (v + kCoeff * v * v * v);
    x[i] = 0.5f * v * (1.0f + std::tanh(inner));
  }
}

void attention_head(const float* q, const float* k, const float* v,
                    std::size_t T, std::size_t head_dim, float* out) {
  const float scale = 1.0f / std::sqrt(static_cast<float>(head_dim));

  // One row of scores at a time. Materialising the full T x T matrix would be
  // the obvious thing and is what FlashAttention exists to avoid — at this
  // scale it barely matters, but the row-at-a-time shape is the one that
  // generalises, and it keeps the working set inside cache.
  std::vector<float> scores(T);

  for (std::size_t i = 0; i < T; ++i) {
    // Causal mask: position i sees j <= i. Enforced by not computing j > i at
    // all, rather than by computing and then masking — the masked values are
    // never in the array, so a later bug cannot leak them into the softmax.
    for (std::size_t j = 0; j <= i; ++j) {
      float dot = 0.0f;
      for (std::size_t d = 0; d < head_dim; ++d) {
        dot += q[i * head_dim + d] * k[j * head_dim + d];
      }
      scores[j] = dot * scale;
    }

    // Softmax over the visible prefix only. This IS the mask-before-softmax
    // rule: normalising over i+1 entries rather than T.
    softmax_inplace(scores.data(), i + 1);

    float* o = out + i * head_dim;
    for (std::size_t d = 0; d < head_dim; ++d) o[d] = 0.0f;
    for (std::size_t j = 0; j <= i; ++j) {
      const float w = scores[j];
      const float* v_row = v + j * head_dim;
      for (std::size_t d = 0; d < head_dim; ++d) o[d] += w * v_row[d];
    }
  }
}

void residual_add(const float* x, std::size_t n, float* out) {
  for (std::size_t i = 0; i < n; ++i) out[i] += x[i];
}

}  // namespace nano
