// Tokeniser agreement with HuggingFace, token for token.
//
// This matters more than it looks. A tokeniser that is 95% right does not
// produce 95% as good output — it feeds the model sequences it never saw in
// training, and the failure presents as fluent nonsense rather than an error.
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

#include "nano_bpe.h"

static std::vector<uint8_t> slurp(const char* p) {
  std::ifstream f(p, std::ios::binary | std::ios::ate);
  if (!f) return {};
  auto n = f.tellg(); f.seekg(0);
  std::vector<uint8_t> b(static_cast<size_t>(n));
  f.read(reinterpret_cast<char*>(b.data()), n);
  return b;
}

int main() {
  auto tb = slurp("public/nano/smollm-tokenizer.bin");
  auto cb = slurp("engines/nano/fixtures/tokenizer-cases.bin");
  if (tb.empty() || cb.empty()) {
    std::fprintf(stderr, "  missing tokenizer blob or cases — run "
                         "engines/nano/tools/export_tokenizer.py\n");
    return 2;
  }

  nano::Bpe bpe;
  if (!bpe.load(tb.data(), tb.size())) {
    std::fprintf(stderr, "  load failed: %s\n", bpe.error().c_str());
    return 2;
  }
  std::printf("\n  BPE vs HuggingFace   vocab %zu · merges %zu\n\n",
              bpe.vocab_size(), bpe.merge_count());

  uint32_t n_cases;
  std::memcpy(&n_cases, cb.data(), 4);
  std::size_t off = 4;
  int pass = 0, fail = 0;

  for (uint32_t c = 0; c < n_cases; ++c) {
    uint16_t raw_len, n_ids;
    std::memcpy(&raw_len, cb.data() + off, 2);
    std::memcpy(&n_ids, cb.data() + off + 2, 2);
    off += 4;
    const std::string text(reinterpret_cast<const char*>(cb.data() + off), raw_len);
    off += raw_len;
    const int32_t* want = reinterpret_cast<const int32_t*>(cb.data() + off);
    off += static_cast<std::size_t>(n_ids) * 4;

    const std::vector<int> got = bpe.encode(text);
    bool same = got.size() == n_ids;
    for (std::size_t i = 0; same && i < got.size(); ++i) same = got[i] == want[i];

    // Round-trip: the bytes must come back exactly, independent of whether the
    // id sequence matched.
    std::string round;
    for (int id : got) round += bpe.token_bytes(id);
    const bool rt = round == text;

    if (same && rt) { ++pass; }
    else {
      ++fail;
      std::string shown = text.size() > 40 ? text.substr(0, 40) + "..." : text;
      for (char& ch : shown) if (ch == '\n') ch = ' ';
      std::printf("  x  %-44s\n", ("\"" + shown + "\"").c_str());
      std::printf("       want %u ids:", n_ids);
      for (uint16_t i = 0; i < n_ids && i < 12; ++i) std::printf(" %d", want[i]);
      std::printf("\n       got  %zu ids:", got.size());
      for (std::size_t i = 0; i < got.size() && i < 12; ++i) std::printf(" %d", got[i]);
      std::printf("\n       round-trip %s\n", rt ? "ok" : "BROKEN");
    }
  }

  std::printf("\n  %d/%u cases match HuggingFace exactly\n\n", pass, n_cases);
  return fail == 0 ? 0 : 1;
}
