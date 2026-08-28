#!/usr/bin/env bash
# Builds and runs the end-to-end logit-parity check against both weight files.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p engines/nano/.build
clang++ -std=c++17 -O2 -Wall -Wextra -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/src/model.cpp \
  engines/nano/test/test_parity.cpp -o engines/nano/.build/test_parity
engines/nano/.build/test_parity public/nano/nano-fp32.bin
engines/nano/.build/test_parity public/nano/nano-int8.bin
