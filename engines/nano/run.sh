#!/usr/bin/env bash
# Generate text from the engine, natively.
#
# The parity tests tell you whether the numbers are right. This tells you what
# it sounds like, which is the other half of knowing a kernel works — a matmul
# with a subtly wrong stride can stay inside tolerance on a 26-token fixture
# and still produce visible mush over 200.
#
# Usage: npm run nano -- [weights] [prompt] [n_tokens] [temperature]
#   npm run nano
#   npm run nano -- public/nano/nano-int8.bin "The honest answer is" 300 0.9
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p engines/nano/.build

clang++ -std=c++17 -O2 -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/src/model.cpp engines/nano/test/cli.cpp \
  -o engines/nano/.build/cli

exec engines/nano/.build/cli "${@:-public/nano/nano-fp32.bin}"
