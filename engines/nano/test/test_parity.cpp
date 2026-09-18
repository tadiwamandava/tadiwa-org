// End-to-end logit parity: this C++ engine against the PyTorch model it was
// trained from.
//
// The op tests prove each kernel in isolation. They cannot catch a transposed
// weight matrix, a mis-sliced attention head, a swapped layernorm, or an
// off-by-one in the KV cache, every one of which still produces text that
// looks superficially plausible. This replays a fixed prompt through the full
// forward pass and diffs the final logits against the reference.
//
// Usage: test_parity <weights.bin>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

#include "nano_model.h"

namespace {

std::vector<uint8_t> slurp(const std::string& path) {
  std::ifstream f(path, std::ios::binary | std::ios::ate);
  if (!f) return {};
  const std::streamsize n = f.tellg();
  f.seekg(0);
  std::vector<uint8_t> b(static_cast<size_t>(n));
  f.read(reinterpret_cast<char*>(b.data()), n);
  return b;
}

}  // namespace

int main(int argc, char** argv) {
  const std::string weights_path =
      argc > 1 ? argv[1] : "public/nano/nano-fp32.bin";

  auto wbytes = slurp(weights_path);
  if (wbytes.empty()) {
    std::fprintf(stderr, "  cannot read %s, run the trainer first\n",
                 weights_path.c_str());
    return 2;
  }
  auto pbytes = slurp("engines/nano/fixtures/parity.bin");
  if (pbytes.size() < 8) {
    std::fprintf(stderr, "  cannot read engines/nano/fixtures/parity.bin\n");
    return 2;
  }

  nano::Model model;
  if (!model.load(wbytes.data(), wbytes.size())) {
    std::fprintf(stderr, "  load failed: %s\n", model.error().c_str());
    return 2;
  }

  uint32_t n_tok, n_vocab;
  std::memcpy(&n_tok, pbytes.data(), 4);
  std::memcpy(&n_vocab, pbytes.data() + 4, 4);
  const int32_t* toks = reinterpret_cast<const int32_t*>(pbytes.data() + 8);
  const float* ref =
      reinterpret_cast<const float*>(pbytes.data() + 8 + n_tok * 4);

  if (n_vocab != model.config().n_vocab) {
    std::fprintf(stderr, "  vocab mismatch: fixture %u, weights %u\n", n_vocab,
                 model.config().n_vocab);
    return 1;
  }

  // Feed the prompt one token at a time, exactly as generation does, so the
  // KV cache is on the hook here too, not bypassed by a batch forward.
  std::vector<float> logits;
  model.reset();
  for (uint32_t i = 0; i < n_tok; ++i) {
    model.forward(toks[i], static_cast<int>(i), logits);
  }

  double max_abs = 0.0, sum_sq = 0.0;
  long worst = -1;
  for (uint32_t v = 0; v < n_vocab; ++v) {
    const double d = std::fabs(static_cast<double>(logits[v]) - ref[v]);
    sum_sq += d * d;
    if (d > max_abs) { max_abs = d; worst = v; }
  }
  const double rms = std::sqrt(sum_sq / n_vocab);

  // int8 weights are lossy by construction, so they get a looser bound. fp32
  // should agree to float noise; anything above ~1e-3 there is a real bug.
  const bool quantised = model.config().quant == 1;
  const double tol = quantised ? 0.60 : 2e-3;

  std::printf("\n  logit parity vs PyTorch  (%s)\n", weights_path.c_str());
  std::printf("    tokens        %u\n", n_tok);
  std::printf("    vocab         %u\n", n_vocab);
  std::printf("    max |diff|    %.3e   at id %ld\n", max_abs, worst);
  std::printf("    rms  diff     %.3e\n", rms);
  std::printf("    tolerance     %.1e  (%s)\n", tol,
              quantised ? "int8, lossy by design" : "fp32");

  // Ranking is what actually drives sampling, so check argmax too, logits can
  // drift within tolerance and still pick a different token.
  int arg_got = 0, arg_ref = 0;
  for (uint32_t v = 1; v < n_vocab; ++v) {
    if (logits[v] > logits[arg_got]) arg_got = static_cast<int>(v);
    if (ref[v] > ref[arg_ref]) arg_ref = static_cast<int>(v);
  }
  const bool argmax_ok = arg_got == arg_ref;
  std::printf("    argmax        %s (got %d, want %d)\n",
              argmax_ok ? "match" : "DIFFER", arg_got, arg_ref);

  const bool ok = max_abs <= tol && argmax_ok;
  std::printf("\n  %s\n\n", ok ? "PASSED" : "FAILED");

  // Appended (not overwritten) so one run covers both weight files, and the
  // page renders whatever the tests actually produced.
  {
    const std::string tag = quantised ? "int8" : "fp32";
    std::ofstream j("engines/nano/fixtures/parity-" + tag + ".json");
    j << "{\n  \"weights\": \"" << tag << "\",\n"
      << "  \"tokens\": " << n_tok << ",\n"
      << "  \"vocab\": " << n_vocab << ",\n"
      << "  \"maxAbsDiff\": " << max_abs << ",\n"
      << "  \"rmsDiff\": " << rms << ",\n"
      << "  \"tolerance\": " << tol << ",\n"
      << "  \"argmaxMatch\": " << (argmax_ok ? "true" : "false") << ",\n"
      << "  \"pass\": " << (ok ? "true" : "false") << "\n}\n";
  }
  return ok ? 0 : 1;
}
