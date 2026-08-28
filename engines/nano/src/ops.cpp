// tadiwa-nano — op implementations.
//
// EVERY FUNCTION BELOW IS YOURS TO WRITE. They ship unimplemented on purpose;
// see include/nano_ops.h for why, and for the shape and semantic contract each
// one has to satisfy.
//
// Workflow:
//   1. npm run test:nano          — shows every op as "stub"
//   2. implement one op here
//   3. remove its name from kStubbed below
//   4. npm run test:nano          — it now passes, fails with a max-abs-error,
//                                   or tells you exactly which element diverged
//
// The fixtures are golden data, not a reference implementation: they contain
// inputs and expected outputs, so there is nothing here to copy from.

#include "nano_ops.h"

#include <cmath>
#include <cstring>
#include <string>

namespace nano {
namespace {

// Remove a name from this list as you implement it. The test runner reads it
// so that unstarted work reports as "stub" rather than as a failure — an
// engine that is 3 ops in should look 3 ops in, not broken.
const char* kStubbed[] = {
    "layernorm", "softmax", "matmul", "gelu", "attention", "residual_add",
};

}  // namespace

bool is_implemented(const char* op_name) {
  for (const char* s : kStubbed) {
    if (std::strcmp(s, op_name) == 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------

void layernorm(const float* x, const float* weight, const float* bias,
               float eps, std::size_t n, float* out) {
  // TODO(tadiwa): mean and BIASED variance over the row, normalise, then
  // scale by weight and shift by bias. Must work in place (out == x).
  (void)x; (void)weight; (void)bias; (void)eps; (void)n; (void)out;
}

void softmax_inplace(float* x, std::size_t n) {
  // TODO(tadiwa): subtract the row max first, then exponentiate and divide by
  // the sum. Without the max subtraction this returns NaN on real logits.
  (void)x; (void)n;
}

void matmul(const float* A, const float* B, std::size_t M, std::size_t K,
            std::size_t N, float* C) {
  // TODO(tadiwa): C = A(MxK) @ B(KxN), row-major. Start with the naive triple
  // loop — correctness first. This is the function that later gets the loop
  // reordering, the blocking and the SIMD, each measured.
  (void)A; (void)B; (void)M; (void)K; (void)N; (void)C;
}

void gelu_inplace(float* x, std::size_t n) {
  // TODO(tadiwa): the tanh approximation, not the exact erf form.
  (void)x; (void)n;
}

void attention_head(const float* q, const float* k, const float* v,
                    std::size_t T, std::size_t head_dim, float* out) {
  // TODO(tadiwa): scaled dot-product with a causal mask applied BEFORE the
  // softmax. You will want softmax_inplace working first.
  (void)q; (void)k; (void)v; (void)T; (void)head_dim; (void)out;
}

void residual_add(const float* x, std::size_t n, float* out) {
  // TODO(tadiwa): out[i] += x[i].
  (void)x; (void)n; (void)out;
}

}  // namespace nano
