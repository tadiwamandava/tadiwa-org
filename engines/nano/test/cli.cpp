// Generation CLI — the human check that sits alongside the numeric ones.
// Usage: cli <weights.bin> [prompt] [n_tokens] [temperature]
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <string>
#include <vector>

#include "nano_model.h"

int main(int argc, char** argv) {
  const std::string wpath = argc > 1 ? argv[1] : "public/nano/nano-fp32.bin";
  const std::string prompt = argc > 2 ? argv[2] : "The engine is";
  const int n_new = argc > 3 ? std::atoi(argv[3]) : 200;
  const float temp = argc > 4 ? static_cast<float>(std::atof(argv[4])) : 0.8f;

  std::ifstream f(wpath, std::ios::binary | std::ios::ate);
  if (!f) { std::fprintf(stderr, "cannot read %s\n", wpath.c_str()); return 2; }
  const std::streamsize n = f.tellg();
  f.seekg(0);
  std::vector<uint8_t> bytes(static_cast<size_t>(n));
  f.read(reinterpret_cast<char*>(bytes.data()), n);

  nano::Model m;
  if (!m.load(bytes.data(), bytes.size())) {
    std::fprintf(stderr, "load failed: %s\n", m.error().c_str());
    return 2;
  }

  auto ids = m.encode(prompt);
  if (ids.empty()) { std::fprintf(stderr, "prompt encoded to nothing\n"); return 2; }

  std::printf("\n  %s  ·  %zu params-worth of weights resident (%.1f KB)\n",
              wpath.c_str(), m.weight_bytes() / sizeof(float),
              m.weight_bytes() / 1024.0);
  std::printf("  prompt: %s\n\n  ", prompt.c_str());

  std::vector<float> logits;
  uint64_t rng = 42;
  m.reset();
  int pos = 0;
  for (std::size_t i = 0; i < ids.size(); ++i) m.forward(ids[i], pos++, logits);

  const auto t0 = std::chrono::steady_clock::now();
  std::string out;
  for (int i = 0; i < n_new && pos < static_cast<int>(m.config().n_ctx); ++i) {
    const int id = nano::sample(logits, temp, 0.95f, rng);
    out += m.decode(id);
    m.forward(id, pos++, logits);
  }
  const auto t1 = std::chrono::steady_clock::now();
  const double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

  std::printf("%s\n\n", out.c_str());
  std::printf("  %d tokens in %.0f ms  ·  %.0f tok/s  ·  %.2f ms/token\n\n",
              n_new, ms, n_new / (ms / 1000.0), ms / n_new);
  return 0;
}
