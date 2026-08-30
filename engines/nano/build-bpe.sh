#!/usr/bin/env bash
# Tokeniser agreement with HuggingFace, token for token.
#
# Separate from build-test.sh because it needs the exported tokenizer blob,
# which build-test.sh's op fixtures do not. Run export_tokenizer.py first if
# public/nano/smollm-tokenizer.bin is missing.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p engines/nano/.build
clang++ -std=c++17 -O2 -Wall -Wextra \
  -Iengines/nano/include \
  engines/nano/src/bpe.cpp engines/nano/test/test_bpe.cpp \
  -o engines/nano/.build/test_bpe
exec engines/nano/.build/test_bpe
