// Native op-parity runner for tadiwa-nano.
//
// Builds with plain clang++ — no Emscripten, no browser, no npm. The loop you
// want while implementing an op is edit -> `npm run test:nano` -> read the max
// absolute error, and anything heavier than a native binary gets in the way of
// that.
//
// Reports three states per op:
//   stub   — not started (nano::is_implemented says so). Not a failure.
//   pass   — max |error| within tolerance of the golden fixture.
//   FAIL   — implemented but wrong, with the worst element and its index.
//
// Also emits engines/nano/fixtures/report.json, which /lab/inference renders,
// so the site's build-log page is generated from the real test run rather than
// hand-maintained.

#include "nano_ops.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace {

const char* kFixtureDir = "engines/nano/fixtures";
constexpr float kTol = 2e-4f;

std::vector<float> load(const std::string& name) {
  std::string path = std::string(kFixtureDir) + "/" + name + ".bin";
  std::ifstream f(path, std::ios::binary | std::ios::ate);
  if (!f) {
    std::fprintf(stderr, "  cannot open %s — run engines/nano/tools/fixtures.sh\n",
                 path.c_str());
    std::exit(2);
  }
  std::streamsize bytes = f.tellg();
  f.seekg(0);
  std::vector<float> out(static_cast<size_t>(bytes) / sizeof(float));
  f.read(reinterpret_cast<char*>(out.data()), bytes);
  return out;
}

struct Result {
  std::string op;
  std::string state;   // stub | pass | fail
  double max_err = 0.0;
  long worst_index = -1;
};

// Compares and records, rather than asserting, so one broken op does not hide
// the state of the other five.
Result compare(const std::string& op, const float* got, const float* want,
               size_t n) {
  Result r{op, "pass", 0.0, -1};
  for (size_t i = 0; i < n; ++i) {
    double e = std::fabs(static_cast<double>(got[i]) - static_cast<double>(want[i]));
    if (std::isnan(e) || e > r.max_err) {
      r.max_err = std::isnan(e) ? INFINITY : e;
      r.worst_index = static_cast<long>(i);
      if (std::isnan(e)) break;
    }
  }
  if (!(r.max_err <= kTol)) r.state = "fail";
  return r;
}

Result stub(const std::string& op) { return Result{op, "stub", 0.0, -1}; }

}  // namespace

int main() {
  std::vector<Result> results;

  // ---- layernorm : x[64] weight[64] bias[64] expected[64] ----------------
  if (!nano::is_implemented("layernorm")) {
    results.push_back(stub("layernorm"));
  } else {
    auto d = load("layernorm");
    const size_t n = 64;
    std::vector<float> out(n);
    nano::layernorm(d.data(), d.data() + n, d.data() + 2 * n, 1e-5f, n, out.data());
    results.push_back(compare("layernorm", out.data(), d.data() + 3 * n, n));
  }

  // ---- softmax : x[128] expected[128] ------------------------------------
  if (!nano::is_implemented("softmax")) {
    results.push_back(stub("softmax"));
  } else {
    auto d = load("softmax");
    const size_t n = 128;
    std::vector<float> x(d.begin(), d.begin() + n);
    nano::softmax_inplace(x.data(), n);
    results.push_back(compare("softmax", x.data(), d.data() + n, n));
  }

  // ---- matmul : A[17x33] B[33x9] expected[17x9] --------------------------
  if (!nano::is_implemented("matmul")) {
    results.push_back(stub("matmul"));
  } else {
    auto d = load("matmul");
    const size_t M = 17, K = 33, N = 9;
    std::vector<float> C(M * N);
    nano::matmul(d.data(), d.data() + M * K, M, K, N, C.data());
    results.push_back(compare("matmul", C.data(), d.data() + M * K + K * N, M * N));
  }

  // ---- gelu : x[96] expected[96] -----------------------------------------
  if (!nano::is_implemented("gelu")) {
    results.push_back(stub("gelu"));
  } else {
    auto d = load("gelu");
    const size_t n = 96;
    std::vector<float> x(d.begin(), d.begin() + n);
    nano::gelu_inplace(x.data(), n);
    results.push_back(compare("gelu", x.data(), d.data() + n, n));
  }

  // ---- matmul_i8 : A[5x24] codes[24x7] scales[7] expected[5x7] ----------
  if (!nano::is_implemented("matmul_i8")) {
    results.push_back(stub("matmul_i8"));
  } else {
    auto d = load("matmul_i8");
    const size_t M = 5, K = 24, N = 7;
    // Codes are stored as f32 in the fixture (one flat float blob keeps the
    // loader trivial); narrow them back to int8 here.
    std::vector<int8_t> codes(K * N);
    for (size_t i = 0; i < K * N; ++i) {
      codes[i] = static_cast<int8_t>(d[M * K + i]);
    }
    const float* scales = d.data() + M * K + K * N;
    std::vector<float> C(M * N);
    nano::matmul_i8(d.data(), codes.data(), scales, M, K, N, C.data());
    results.push_back(
        compare("matmul_i8", C.data(), d.data() + M * K + K * N + N, M * N));
  }

  // ---- attention : q,k,v [12x16] expected[12x16] -------------------------
  if (!nano::is_implemented("attention")) {
    results.push_back(stub("attention"));
  } else {
    auto d = load("attention");
    const size_t T = 12, hd = 16, sz = T * hd;
    std::vector<float> out(sz);
    nano::attention_head(d.data(), d.data() + sz, d.data() + 2 * sz, T, hd, out.data());
    results.push_back(compare("attention", out.data(), d.data() + 3 * sz, sz));
  }

  // ---- rmsnorm : x[64] weight[64] expected[64] ---------------------------
  if (!nano::is_implemented("rmsnorm")) {
    results.push_back(stub("rmsnorm"));
  } else {
    auto d = load("rmsnorm");
    const size_t n = 64;
    std::vector<float> out(n);
    nano::rmsnorm(d.data(), d.data() + n, 1e-5f, n, out.data());
    results.push_back(compare("rmsnorm", out.data(), d.data() + 2 * n, n));
  }

  // ---- silu : x[80] expected[80] -----------------------------------------
  if (!nano::is_implemented("silu")) {
    results.push_back(stub("silu"));
  } else {
    auto d = load("silu");
    const size_t n = 80;
    std::vector<float> x(d.begin(), d.begin() + n);
    nano::silu_inplace(x.data(), n);
    results.push_back(compare("silu", x.data(), d.data() + n, n));
  }

  // ---- rope : x[64] expected[64], pos 37, theta 10000 --------------------
  if (!nano::is_implemented("rope")) {
    results.push_back(stub("rope"));
  } else {
    auto d = load("rope");
    const size_t hd = 64;
    std::vector<float> x(d.begin(), d.begin() + hd);
    nano::rope_inplace(x.data(), hd, 37, 10000.0f);
    results.push_back(compare("rope", x.data(), d.data() + hd, hd));
  }

  // ---- residual_add : x[50] out[50] expected[50] -------------------------
  if (!nano::is_implemented("residual_add")) {
    results.push_back(stub("residual_add"));
  } else {
    auto d = load("residual_add");
    const size_t n = 50;
    std::vector<float> acc(d.begin() + n, d.begin() + 2 * n);
    nano::residual_add(d.data(), n, acc.data());
    results.push_back(compare("residual_add", acc.data(), d.data() + 2 * n, n));
  }

  int stubs = 0, passes = 0, fails = 0;
  std::printf("\n  tadiwa-nano op parity\n\n");
  for (const auto& r : results) {
    if (r.state == "stub") {
      ++stubs;
      std::printf("  ·  %-14s stub — not implemented yet\n", r.op.c_str());
    } else if (r.state == "pass") {
      ++passes;
      std::printf("  ✓  %-14s max err %.2e\n", r.op.c_str(), r.max_err);
    } else {
      ++fails;
      std::printf("  ✗  %-14s max err %.4e at index %ld (tolerance %.0e)\n",
                  r.op.c_str(), r.max_err, r.worst_index, kTol);
    }
  }
  std::printf("\n  %d implemented, %d stubbed, %d failing\n\n", passes, stubs, fails);

  // The site reads this. Written on every run so the page cannot drift from
  // the tests.
  std::ostringstream j;
  j << "{\n  \"generated\": \"native\",\n  \"tolerance\": " << kTol
    << ",\n  \"ops\": [\n";
  for (size_t i = 0; i < results.size(); ++i) {
    const auto& r = results[i];
    j << "    {\"op\": \"" << r.op << "\", \"state\": \"" << r.state
      << "\", \"maxError\": " << (std::isfinite(r.max_err) ? r.max_err : -1.0)
      << ", \"worstIndex\": " << r.worst_index << "}";
    if (i + 1 < results.size()) j << ",";
    j << "\n";
  }
  j << "  ],\n  \"passing\": " << passes << ",\n  \"stubbed\": " << stubs
    << ",\n  \"failing\": " << fails << "\n}\n";
  std::ofstream out(std::string(kFixtureDir) + "/report.json");
  out << j.str();

  return fails > 0 ? 1 : 0;
}
