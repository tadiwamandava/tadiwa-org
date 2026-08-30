// Byte-level BPE, the GPT-2 family algorithm.
//
// Two stages, and the first one is where implementations quietly go wrong.
//
//   1. PRE-TOKENISATION splits text into chunks that merges may never cross,
//      roughly "a run of letters, optionally preceded by one space". Get this
//      wrong and every downstream token is different from the reference, the
//      model sees a sequence it was never trained on, and the output is fluent
//      nonsense rather than an obvious error.
//   2. MERGING repeatedly joins the adjacent pair with the lowest merge rank
//      until none apply. Rank order matters; it is not longest-match.
//
// The reference pre-tokeniser is a regex using Unicode property classes, which
// std::regex does not support. This implements the same partition by hand for
// ASCII, treating any byte >= 0x80 as a letter, correct for Latin scripts, an
// approximation elsewhere. `bpe_selftest` measures the real agreement against
// HuggingFace rather than assuming it.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace nano {

class Bpe {
 public:
  /// Parses the blob written by tools/export_tokenizer.py.
  bool load(const uint8_t* data, std::size_t len);

  std::vector<int> encode(const std::string& text) const;
  /// Raw bytes for one id. Byte-level, so a single id may be a partial UTF-8
  /// sequence; callers accumulate and decode as a stream.
  const std::string& token_bytes(int id) const;

  /// Id for an added token written out literally, "<|im_end|>" and friends,
  /// or -1 if this vocabulary has no such token. Chat templates are built from
  /// these, so a caller that gets -1 should say so rather than guess an id.
  int special_id(const std::string& text) const;

  std::size_t vocab_size() const { return vocab_.size(); }
  std::size_t merge_count() const { return merges_.size(); }
  std::size_t special_count() const { return specials_.size(); }
  const std::string& error() const { return error_; }

 private:
  std::vector<std::string> vocab_;
  /// (left << 32 | right) -> (rank, merged id). Rank breaks ties toward the
  /// merge that was learned earliest, which is what defines BPE's output.
  std::unordered_map<uint64_t, std::pair<uint32_t, uint32_t>> merges_;
  /// Single-byte token ids, for seeding a word before any merging.
  int byte_id_[256];
  /// Added tokens, longest first so a prefix can never shadow a longer match.
  /// Matched against the raw input BEFORE pre-tokenisation, which is the order
  /// the reference implementation uses.
  std::vector<std::pair<std::string, int>> specials_;
  std::string error_;
  std::string empty_;

  void merge_word(std::vector<int>& ids) const;
  /// Encodes a span with no added tokens in it, the ordinary BPE path.
  void encode_plain(const std::string& text, std::vector<int>& out) const;
};

/// Splits on the GPT-2 partition. Exposed for testing.
std::vector<std::string> bpe_pretokenize(const std::string& text);

}  // namespace nano
