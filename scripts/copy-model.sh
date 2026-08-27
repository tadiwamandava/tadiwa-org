#!/usr/bin/env bash
# Copies the quantised MiniLM out of the transformers cache into public/models/,
# so the browser fetches the weights SAME-ORIGIN instead of from a third-party
# CDN. ~22 MB, gitignored, regenerated at build time.
#
# Run after `npm run build:search`, which is what populates the cache.
set -euo pipefail
SRC="node_modules/@huggingface/transformers/.cache/Xenova/all-MiniLM-L6-v2"
DST="public/models/all-MiniLM-L6-v2"

if [ ! -d "$SRC" ]; then
  echo "  model cache not found — run 'npm run build:search' first" >&2
  exit 1
fi

mkdir -p "$DST/onnx"
cp "$SRC/config.json" "$SRC/tokenizer.json" "$SRC/tokenizer_config.json" "$DST/"
cp "$SRC/onnx/model_quantized.onnx" "$DST/onnx/"
echo "  copied $(du -sh "$DST" | cut -f1) to $DST"
