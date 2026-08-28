// tadiwa-nano — the primitive ops a transformer forward pass is made of.
//
// THESE ARE THE PARTS YOU WRITE. Everything else in this directory — weight
// loading, the tokenizer, sampling, the WebAssembly bindings, the test runner,
// the browser UI — is plumbing that exists so that implementing the functions
// below is the only thing standing between you and a working engine.
//
// Each declaration states the shapes and the semantics precisely enough to
// implement from, and deliberately does not state HOW. Every one is checked
// against golden fixtures produced by tools/make_fixtures.py; run
// `npm run test:nano` and the runner tells you which ops match and by how much
// they are off when they do not.
//
// A note on why the stubs are here rather than filled in: an interviewer will
// pick a file in this repo and ask you to walk through it. The ops below are
// exactly the ones they will pick, so they need to be yours. The reference in
// tools/make_fixtures.py is numpy — deliberately, because transliterating
// numpy into cache-aware C++ leaves all of the actual engineering (loop order,
// blocking, memory layout, quantisation) still to do.
//
// Suggested order: rms/layernorm -> softmax -> matmul -> gelu -> attention.
// The runner reports them in that order and each builds on the last.

#pragma once
#include <cstddef>
#include <cstdint>

namespace nano {

/// Layer normalisation over the last dimension.
///
///   out[i] = (x[i] - mean) / sqrt(var + eps) * weight[i] + bias[i]
///
/// where mean and var are taken over all `n` elements of this row, and `var`
/// is the BIASED estimate (divide by n, not n-1) — this is what every
/// transformer implementation uses, and getting it wrong shifts logits by an
/// amount too small to see and too large to ignore.
///
/// x, weight, bias, out are each `n` long. In-place (out == x) must work.
void layernorm(const float* x, const float* weight, const float* bias,
               float eps, std::size_t n, float* out);

/// Softmax over `n` elements, in place.
///
/// Must subtract the row max before exponentiating. Skipping that is the
/// classic bug: it produces identical results on small test inputs and
/// silently returns NaN on real logits once any value exceeds ~88.
void softmax_inplace(float* x, std::size_t n);

/// C = A * B, row-major, no transpose.
///   A is (M x K), B is (K x N), C is (M x N).
///
/// The naive triple loop is the correct place to start and is what the fixture
/// checks. Once it passes, this is the function worth optimising — it is where
/// essentially all of the time goes, and PERFORMANCE.md is meant to record what
/// each change bought.
void matmul(const float* A, const float* B, std::size_t M, std::size_t K,
            std::size_t N, float* C);

/// C = A * Bq, where the WEIGHTS are int8 and the activations stay fp32.
///
///   A      is (M x K) float
///   Bq     is (K x N) int8, row-major
///   scales is (N) float — ONE PER OUTPUT COLUMN, not one per tensor
///   C      is (M x N) float
///
/// Weight-only quantisation (W8A32). This exists because it is the only way a
/// 124M-parameter model fits in a browser tab: dequantising GPT-2 to fp32 is
/// ~475 MB resident, and keeping the weights packed is ~119 MB. The
/// dequantisation happens per element inside the inner loop, where it is free
/// relative to the multiply-accumulate that has to happen anyway.
///
/// Per-COLUMN scales, not per-tensor: a single scale for a 768x2304 matrix is
/// set by its largest outlier, which crushes the resolution of every other
/// column. Per-column costs N floats and recovers most of the quality.
void matmul_i8(const float* A, const int8_t* Bq, const float* scales,
               std::size_t M, std::size_t K, std::size_t N, float* C);

/// GELU activation, in place, over `n` elements.
///
/// Use the tanh approximation, which is what GPT-2's weights were trained
/// against:
///   0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
/// The exact erf formulation is a different function and will not match the
/// fixtures.
void gelu_inplace(float* x, std::size_t n);

/// Single-head scaled dot-product attention with a causal mask.
///
///   q, k, v are each (T x head_dim), row-major.
///   out     is  (T x head_dim).
///
///   scores = q @ k^T / sqrt(head_dim)          -> (T x T)
///   mask   : position i may attend to j <= i only
///   probs  = softmax(scores, over j)
///   out    = probs @ v
///
/// Mask BEFORE the softmax, by setting disallowed positions to -infinity (or a
/// large negative). Masking after softmax renormalises the wrong distribution
/// and is the single most common attention bug.
void attention_head(const float* q, const float* k, const float* v,
                    std::size_t T, std::size_t head_dim, float* out);

/// out[i] += x[i], over `n` elements. The residual connection.
void residual_add(const float* x, std::size_t n, float* out);

/// True once an op is implemented. The test runner uses this to report
/// "stub" rather than "fail" for work that has not started, so an unfinished
/// engine reads as unfinished rather than broken.
bool is_implemented(const char* op_name);

}  // namespace nano
