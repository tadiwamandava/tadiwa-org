#!/usr/bin/env bash
# Logit parity for the Llama-family engine, against HuggingFace.
#
# Runs against whichever weight files are in the checkout. The int8 file is
# 129 MB and the fp32 file 513 MB, so neither is guaranteed to be there — a
# missing file is reported as SKIPPED rather than failing, for the same reason
# an unimplemented op reports "stub": a gate that goes red for a reason
# unrelated to correctness gets ignored, and then it is not a gate.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p engines/nano/.build

clang++ -std=c++17 -O2 -Wall -Wextra \
  -Iengines/nano/include \
  engines/nano/src/ops.cpp engines/nano/src/llama.cpp engines/nano/test/test_llama.cpp \
  -o engines/nano/.build/test_llama

ran=0
status=0
for w in public/nano/smollm-int8.bin public/nano/smollm-fp32.bin; do
  if [ -f "$w" ]; then
    ran=1
    engines/nano/.build/test_llama "$w" || status=1
  else
    printf '\n  SKIPPED  %s is not in this checkout\n' "$w"
  fi
done

if [ "$ran" = 0 ]; then
  printf '\n  No SmolLM2 weights present — nothing to check. Regenerate with\n'
  printf '  engines/nano/tools/convert_smollm.py, or see DEPLOY.md.\n\n'
fi
exit "$status"
