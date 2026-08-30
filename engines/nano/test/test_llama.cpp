// Logit parity for the Llama-family engine, against HuggingFace.
//
// This is the only check that can catch the things the op fixtures cannot:
// a transposed projection, RoPE applied to v, a query head reading the wrong
// KV head under grouped-query attention, gate and up swapped in the SwiGLU.
// Every one of those leaves the kernels passing and the model wrong.
//
// Usage: test_llama <weights.bin>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

#include "nano_llama.h"

namespace {
std::vector<uint8_t> slurp(const std::string& p) {
  std::ifstream f(p, std::ios::binary | std::ios::ate);
  if (!f) return {};
  const std::streamsize n = f.tellg();
  f.seekg(0);
  std::vector<uint8_t> b(static_cast<size_t>(n));
  f.read(reinterpret_cast<char*>(b.data()), n);
  return b;
}
}  // namespace

int main(int argc, char** argv) {
  const std::string wpath = argc > 1 ? argv[1] : "public/nano/smollm-int8.bin";

  auto w = slurp(wpath);
  if (w.empty()) { std::fprintf(stderr, "  cannot read %s\n", wpath.c_str()); return 2; }
  auto p = slurp("engines/nano/fixtures/smollm-parity.bin");
  if (p.size() < 8) { std::fprintf(stderr, "  cannot read the parity fixture\n"); return 2; }

  const bool quantised = wpath.find("int8") != std::string::npos;

  nano::LlamaModel m;
  const auto t_load0 = std::chrono::steady_clock::now();
  if (!m.load(std::move(w))) {
    std::fprintf(stderr, "  load failed: %s\n", m.error().c_str());
    return 2;
  }
  const double load_ms = std::chrono::duration<double, std::milli>(
      std::chrono::steady_clock::now() - t_load0).count();

  uint32_t n_tok, n_vocab;
  std::memcpy(&n_tok, p.data(), 4);
  std::memcpy(&n_vocab, p.data() + 4, 4);
  const int32_t* toks = reinterpret_cast<const int32_t*>(p.data() + 8);
  const float* ref = reinterpret_cast<const float*>(p.data() + 8 + n_tok * 4);

  if (n_vocab != m.config().n_vocab) {
    std::fprintf(stderr, "  vocab mismatch: fixture %u, weights %u\n", n_vocab,
                 m.config().n_vocab);
    return 1;
  }

  std::vector<float> logits;
  m.reset();
  const auto t0 = std::chrono::steady_clock::now();
  for (uint32_t i = 0; i < n_tok; ++i) m.forward(toks[i], static_cast<int>(i), logits);
  const double ms = std::chrono::duration<double, std::milli>(
      std::chrono::steady_clock::now() - t0).count();

  double max_abs = 0.0, sum_sq = 0.0;
  long worst = -1;
  for (uint32_t v = 0; v < n_vocab; ++v) {
    const double d = std::fabs(static_cast<double>(logits[v]) - ref[v]);
    sum_sq += d * d;
    if (d > max_abs) { max_abs = d; worst = v; }
  }
  const double rms = std::sqrt(sum_sq / n_vocab);

  int arg_got = 0, arg_ref = 0;
  for (uint32_t v = 1; v < n_vocab; ++v) {
    if (logits[v] > logits[arg_got]) arg_got = static_cast<int>(v);
    if (ref[v] > ref[arg_ref]) arg_ref = static_cast<int>(v);
  }

  // int8 is lossy by construction and this model is 30 layers deep, so the
  // error compounds; the bound is loose on purpose. What must hold either way
  // is the ARGMAX, if the top token moves, the quantisation has changed the
  // answer and not merely the confidence.
  const double tol = quantised ? 2.5 : 5e-3;
  const bool ok = max_abs <= tol && arg_got == arg_ref;

  std::printf("\n  SmolLM2 logit parity  (%s)\n", wpath.c_str());
  std::printf("    resident      %.0f MB   (load %.0f ms)\n",
              m.resident_bytes() / 1048576.0, load_ms);
  std::printf("    prompt        %u tokens, %.0f ms  (%.0f ms/token)\n",
              n_tok, ms, ms / n_tok);
  std::printf("    max |diff|    %.3e   at id %ld\n", max_abs, worst);
  std::printf("    rms  diff     %.3e\n", rms);
  std::printf("    tolerance     %.1e  (%s)\n", tol, quantised ? "int8" : "fp32");
  std::printf("    argmax        %s (got %d, want %d)\n",
              arg_got == arg_ref ? "match" : "DIFFER", arg_got, arg_ref);
  std::printf("\n  %s\n\n", ok ? "PASSED" : "FAILED");

  // The page renders these rather than a hand-written table, so it cannot
  // claim a parity number the test did not produce. Written on failure too,
  // because a page that silently keeps showing the last passing figures would
  // be worse than one that shows a red row.
  const std::string out = std::string("engines/nano/fixtures/smollm-parity-") +
                          (quantised ? "int8" : "fp32") + ".json";
  if (std::FILE* f = std::fopen(out.c_str(), "w")) {
    std::fprintf(f,
                 "{\n  \"weights\": \"%s\",\n  \"tokens\": %u,\n  \"vocab\": %u,\n"
                 "  \"maxAbsDiff\": %.6e,\n  \"rmsDiff\": %.6e,\n  \"tolerance\": %.6e,\n"
                 "  \"argmaxMatch\": %s,\n  \"argmax\": %d,\n"
                 "  \"msPerToken\": %.3f,\n  \"residentBytes\": %zu,\n  \"pass\": %s\n}\n",
                 quantised ? "int8" : "fp32", n_tok, n_vocab, max_abs, rms, tol,
                 arg_got == arg_ref ? "true" : "false", arg_ref, ms / n_tok,
                 m.resident_bytes(), ok ? "true" : "false");
    std::fclose(f);
  }
  return ok ? 0 : 1;
}
