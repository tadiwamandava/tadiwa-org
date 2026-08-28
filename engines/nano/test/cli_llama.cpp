// Generate from a Llama-family model. Usage:
//   cli_llama <weights> <tokenizer> [prompt] [n] [temp]
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <string>
#include <vector>
#include "nano_bpe.h"
#include "nano_llama.h"
#include "nano_model.h"   // for nano::sample

static std::vector<uint8_t> slurp(const std::string& p) {
  std::ifstream f(p, std::ios::binary | std::ios::ate);
  if (!f) return {};
  auto n = f.tellg(); f.seekg(0);
  std::vector<uint8_t> b(static_cast<size_t>(n));
  f.read(reinterpret_cast<char*>(b.data()), n);
  return b;
}

int main(int argc, char** argv) {
  const std::string wp = argc > 1 ? argv[1] : "public/nano/smollm-int8.bin";
  const std::string tp = argc > 2 ? argv[2] : "public/nano/smollm-tokenizer.bin";
  const std::string prompt = argc > 3 ? argv[3] : "The capital of France is";
  const int n_new = argc > 4 ? std::atoi(argv[4]) : 60;
  const float temp = argc > 5 ? (float)std::atof(argv[5]) : 0.0f;

  auto tb = slurp(tp);
  nano::Bpe bpe;
  if (tb.empty() || !bpe.load(tb.data(), tb.size())) {
    std::fprintf(stderr, "tokenizer: %s\n", bpe.error().c_str()); return 2;
  }
  auto wb = slurp(wp);
  nano::LlamaModel m;
  if (wb.empty() || !m.load(std::move(wb))) {
    std::fprintf(stderr, "weights: %s\n", m.error().c_str()); return 2;
  }

  const auto ids = bpe.encode(prompt);
  std::printf("\n  %s  ·  %.0f MB resident\n", wp.c_str(), m.resident_bytes() / 1048576.0);
  std::printf("  prompt (%zu tokens): %s", ids.size(), prompt.c_str());
  std::fflush(stdout);

  std::vector<float> logits;
  uint64_t rng = 7;
  m.reset();
  int pos = 0;
  const auto t0 = std::chrono::steady_clock::now();
  for (int id : ids) m.forward(id, pos++, logits);
  const auto t1 = std::chrono::steady_clock::now();

  for (int i = 0; i < n_new && pos < (int)m.config().n_ctx; ++i) {
    const int id = nano::sample(logits, temp, 0.9f, rng);
    std::printf("%s", bpe.token_bytes(id).c_str());
    std::fflush(stdout);
    m.forward(id, pos++, logits);
  }
  const auto t2 = std::chrono::steady_clock::now();
  const double pre = std::chrono::duration<double, std::milli>(t1 - t0).count();
  const double gen = std::chrono::duration<double, std::milli>(t2 - t1).count();
  std::printf("\n\n  prefill %.0f ms  ·  %d tokens in %.0f ms  ·  %.1f tok/s\n\n",
              pre, n_new, gen, n_new / (gen / 1000.0));
  return 0;
}
