#include "nano_bpe.h"

#include <algorithm>
#include <cstring>
#include <limits>


namespace nano {
namespace {

constexpr uint32_t kMagic = 0x4B544454;  // "TDTK"

/// Decodes one UTF-8 sequence at `i`, advancing `len`. Returns the codepoint,
/// or 0xFFFD on a malformed sequence (consuming one byte so callers cannot spin).
uint32_t decode_utf8(const std::string& t, std::size_t i, std::size_t& len) {
  const unsigned char c = static_cast<unsigned char>(t[i]);
  const std::size_t n = t.size();
  if (c < 0x80) { len = 1; return c; }
  auto cont = [&](std::size_t k) {
    return i + k < n && (static_cast<unsigned char>(t[i + k]) & 0xC0) == 0x80;
  };
  auto at = [&](std::size_t k) { return static_cast<unsigned char>(t[i + k]) & 0x3F; };
  if ((c & 0xE0) == 0xC0 && cont(1)) { len = 2; return ((c & 0x1Fu) << 6) | at(1); }
  if ((c & 0xF0) == 0xE0 && cont(1) && cont(2)) {
    len = 3; return ((c & 0x0Fu) << 12) | (at(1) << 6) | at(2);
  }
  if ((c & 0xF8) == 0xF0 && cont(1) && cont(2) && cont(3)) {
    len = 4; return ((c & 0x07u) << 18) | (at(1) << 12) | (at(2) << 6) | at(3);
  }
  len = 1;
  return 0xFFFD;
}

/// Approximates \p{L} for the ranges real text actually uses.
///
/// The first version treated every byte >= 0x80 as a letter, which is wrong in
/// the most visible possible way: an em dash inside a word made "em—dash" a
/// single pre-token where the reference splits it in three, and every token
/// after it differed. A full Unicode category table would be tens of kilobytes
/// for a gain over these ranges that this engine will never observe.
bool is_letter_cp(uint32_t cp) {
  if (cp < 0x80) {
    return (cp >= 'a' && cp <= 'z') || (cp >= 'A' && cp <= 'Z');
  }
  // Explicitly NOT letters — punctuation, arrows, technical symbols, emoji.
  if ((cp >= 0x2000 && cp <= 0x206F) ||   // general punctuation: — “ ” … •
      (cp >= 0x2070 && cp <= 0x209F) ||   // super/subscripts
      (cp >= 0x20A0 && cp <= 0x20CF) ||   // currency
      (cp >= 0x2100 && cp <= 0x214F) ||   // letterlike symbols
      (cp >= 0x2190 && cp <= 0x21FF) ||   // arrows: →
      (cp >= 0x2200 && cp <= 0x22FF) ||   // maths operators
      (cp >= 0x2300 && cp <= 0x23FF) ||   // misc technical: ⌘
      (cp >= 0x2400 && cp <= 0x27BF) ||   // symbols, dingbats
      (cp >= 0x2E00 && cp <= 0x2E7F) ||   // supplemental punctuation
      (cp >= 0x3000 && cp <= 0x303F) ||   // CJK punctuation
      cp >= 0x1F000) {                     // emoji and beyond
    return false;
  }
  if (cp == 0x00AA || cp == 0x00B5 || cp == 0x00BA) return true;
  if (cp >= 0x00C0 && cp <= 0x02FF && cp != 0x00D7 && cp != 0x00F7) return true;
  if (cp >= 0x0370 && cp <= 0x1FFF) return true;   // Greek .. Latin extended-add
  if (cp >= 0x2C00 && cp <= 0x2DFF) return true;
  if (cp >= 0x3040 && cp <= 0x9FFF) return true;   // kana, CJK
  if (cp >= 0xA000 && cp <= 0xD7FF) return true;   // Yi, Hangul
  if (cp >= 0xF900 && cp <= 0xFDCF) return true;
  return false;
}

inline bool is_digit(unsigned char c) { return c >= '0' && c <= '9'; }
inline bool is_space(unsigned char c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

uint32_t rd32(const uint8_t* p) { uint32_t v; std::memcpy(&v, p, 4); return v; }
uint16_t rd16(const uint8_t* p) { uint16_t v; std::memcpy(&v, p, 2); return v; }

}  // namespace

std::vector<std::string> bpe_pretokenize(const std::string& t) {
  // Mirrors GPT-2's pattern:
  //   's|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+
  std::vector<std::string> out;
  const std::size_t n = t.size();
  std::size_t i = 0;

  auto starts_with = [&](std::size_t at, const char* s) {
    const std::size_t l = std::strlen(s);
    return at + l <= n && t.compare(at, l, s) == 0;
  };

  while (i < n) {
    // Contractions, before anything else — they are the reason the pattern
    // begins with a list of literals.
    static const char* kContractions[] = {"'s", "'t", "'re", "'ve", "'m", "'ll", "'d"};
    bool matched = false;
    for (const char* c : kContractions) {
      if (starts_with(i, c)) {
        out.emplace_back(c);
        i += std::strlen(c);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const std::size_t start = i;
    // An optional single leading space belongs to the following run — this is
    // why " the" is one token and "the" is another.
    const bool lead_space = t[i] == ' ' && i + 1 < n && !is_space((unsigned char)t[i + 1]);
    if (lead_space) ++i;

    std::size_t cl = 0;
    if (i < n && is_letter_cp(decode_utf8(t, i, cl))) {
      while (i < n) {
        std::size_t l = 0;
        if (!is_letter_cp(decode_utf8(t, i, l))) break;
        i += l;
      }
    } else if (i < n && is_digit((unsigned char)t[i])) {
      while (i < n && is_digit((unsigned char)t[i])) ++i;
    } else if (i < n && !is_space((unsigned char)t[i])) {
      // A run of "everything else": not space, not letter, not digit.
      while (i < n && !is_space((unsigned char)t[i]) && !is_digit((unsigned char)t[i])) {
        std::size_t l = 0;
        if (is_letter_cp(decode_utf8(t, i, l))) break;
        i += l;
      }
    } else {
      // A whitespace run. The reference keeps the final space with the NEXT
      // chunk unless the run ends the string, which is the `\s+(?!\S)` branch.
      i = start;
      std::size_t j = i;
      while (j < n && is_space((unsigned char)t[j])) ++j;
      const std::size_t keep = (j < n && j > i + 1) ? j - 1 : j;
      out.emplace_back(t.substr(i, keep - i));
      i = keep;
      continue;
    }
    if (i > start) out.emplace_back(t.substr(start, i - start));
    else ++i;  // never stall
  }
  return out;
}

bool Bpe::load(const uint8_t* d, std::size_t len) {
  error_.clear();
  if (len < 12 || rd32(d) != kMagic) { error_ = "not a nano tokenizer blob"; return false; }
  const uint32_t n_vocab = rd32(d + 4);
  const uint32_t n_merges = rd32(d + 8);

  vocab_.assign(n_vocab, std::string());
  for (int i = 0; i < 256; ++i) byte_id_[i] = -1;

  std::size_t off = 12;
  for (uint32_t i = 0; i < n_vocab; ++i) {
    if (off + 2 > len) { error_ = "truncated vocabulary"; return false; }
    const uint16_t l = rd16(d + off);
    off += 2;
    if (off + l > len) { error_ = "truncated vocabulary entry"; return false; }
    vocab_[i].assign(reinterpret_cast<const char*>(d + off), l);
    if (l == 1) byte_id_[(unsigned char)vocab_[i][0]] = static_cast<int>(i);
    off += l;
  }

  merges_.reserve(n_merges * 2);
  for (uint32_t r = 0; r < n_merges; ++r) {
    if (off + 12 > len) { error_ = "truncated merges"; return false; }
    const uint32_t a = rd32(d + off), b = rd32(d + off + 4), c = rd32(d + off + 8);
    off += 12;
    merges_[(static_cast<uint64_t>(a) << 32) | b] = {r, c};
  }

  // Trailing added-token section. Optional: a tokenizer blob written before
  // this section existed still loads, and simply has no tokens to split on.
  specials_.clear();
  if (off + 4 <= len) {
    const uint32_t n_special = rd32(d + off);
    off += 4;
    for (uint32_t i = 0; i < n_special && off + 4 <= len; ++i) {
      const uint32_t id = rd32(d + off);
      off += 4;
      if (id < vocab_.size() && !vocab_[id].empty()) {
        specials_.emplace_back(vocab_[id], static_cast<int>(id));
      }
    }
    // Longest first: "<|im_start|>" must win over any added token that is a
    // prefix of it, and a leftmost-longest scan is what the reference does.
    std::sort(specials_.begin(), specials_.end(),
              [](const auto& a, const auto& b) {
                return a.first.size() > b.first.size();
              });
  }
  return true;
}

int Bpe::special_id(const std::string& text) const {
  for (const auto& s : specials_) {
    if (s.first == text) return s.second;
  }
  return -1;
}

void Bpe::merge_word(std::vector<int>& ids) const {
  while (ids.size() > 1) {
    uint32_t best_rank = std::numeric_limits<uint32_t>::max();
    std::size_t best_at = 0;
    uint32_t best_id = 0;

    // Lowest rank wins, and ties go to the leftmost pair. Scanning for the
    // minimum each pass is O(n^2) in the length of a word; words are short
    // enough that a priority queue would cost more than it saves.
    for (std::size_t i = 0; i + 1 < ids.size(); ++i) {
      const uint64_t key = (static_cast<uint64_t>(ids[i]) << 32) |
                           static_cast<uint32_t>(ids[i + 1]);
      auto it = merges_.find(key);
      if (it != merges_.end() && it->second.first < best_rank) {
        best_rank = it->second.first;
        best_at = i;
        best_id = it->second.second;
      }
    }
    if (best_rank == std::numeric_limits<uint32_t>::max()) break;
    ids[best_at] = static_cast<int>(best_id);
    ids.erase(ids.begin() + static_cast<long>(best_at) + 1);
  }
}

void Bpe::encode_plain(const std::string& text, std::vector<int>& out) const {
  for (const std::string& word : bpe_pretokenize(text)) {
    std::vector<int> ids;
    ids.reserve(word.size());
    for (unsigned char c : word) {
      const int id = byte_id_[c];
      if (id >= 0) ids.push_back(id);
    }
    merge_word(ids);
    out.insert(out.end(), ids.begin(), ids.end());
  }
}

std::vector<int> Bpe::encode(const std::string& text) const {
  std::vector<int> out;
  if (specials_.empty()) {
    encode_plain(text, out);
    return out;
  }

  // Added tokens are cut out of the text first and emitted as themselves; the
  // spans between them go through the ordinary path. Doing this before
  // pre-tokenisation is not an optimisation — "<|im_end|>" contains characters
  // the pre-tokeniser would split on, so afterwards would be too late.
  std::size_t seg = 0, i = 0;
  const std::size_t n = text.size();
  while (i < n) {
    const std::pair<std::string, int>* hit = nullptr;
    for (const auto& s : specials_) {
      if (i + s.first.size() <= n && text.compare(i, s.first.size(), s.first) == 0) {
        hit = &s;
        break;   // specials_ is longest-first, so the first match is the longest
      }
    }
    if (!hit) { ++i; continue; }
    if (i > seg) encode_plain(text.substr(seg, i - seg), out);
    out.push_back(hit->second);
    i += hit->first.size();
    seg = i;
  }
  if (seg < n) encode_plain(text.substr(seg), out);
  return out;
}

const std::string& Bpe::token_bytes(int id) const {
  if (id < 0 || static_cast<std::size_t>(id) >= vocab_.size()) return empty_;
  return vocab_[static_cast<std::size_t>(id)];
}

}  // namespace nano
