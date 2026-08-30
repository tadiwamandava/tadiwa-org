#!/usr/bin/env bash
# Copies the quantised models out of the transformers cache into public/models/,
# so the browser fetches weights SAME-ORIGIN instead of from a third-party CDN.
# Both are gitignored and regenerated at build time.
#
#   all-MiniLM-L6-v2   ~22 MB  query embeddings for semantic search
#   whisper-tiny.en    ~42 MB  speech recognition for the voice assistant
#
# Run after `npm run build:search` (populates the MiniLM cache) and
# `npm run build:voice` (populates the Whisper cache).
set -euo pipefail

CACHE="node_modules/@huggingface/transformers/.cache"
missing=0

copy_minilm() {
  local src="$CACHE/Xenova/all-MiniLM-L6-v2"
  local dst="public/models/all-MiniLM-L6-v2"
  if [ ! -d "$src" ]; then
    echo "  MiniLM cache not found, run 'npm run build:search' first" >&2
    missing=1
    return
  fi
  mkdir -p "$dst/onnx"
  cp "$src/config.json" "$src/tokenizer.json" "$src/tokenizer_config.json" "$dst/"
  cp "$src/onnx/model_quantized.onnx" "$dst/onnx/"
  echo "  $(du -sh "$dst" | cut -f1)  $dst"
}

copy_whisper() {
  local src="$CACHE/onnx-community/whisper-tiny.en"
  local dst="public/models/whisper-tiny.en"
  if [ ! -d "$src" ]; then
    echo "  Whisper cache not found, run 'npm run build:voice' first" >&2
    missing=1
    return
  fi
  mkdir -p "$dst/onnx"
  # preprocessor_config.json is what tells the pipeline the mel-spectrogram
  # settings. Without it transformers.js refuses to build the feature
  # extractor, and the failure reads as a 404 on a file nobody mentioned.
  cp "$src/config.json" "$src/generation_config.json" \
     "$src/preprocessor_config.json" "$src/tokenizer.json" \
     "$src/tokenizer_config.json" "$dst/"
  cp "$src/onnx/encoder_model_quantized.onnx" \
     "$src/onnx/decoder_model_merged_quantized.onnx" "$dst/onnx/"
  echo "  $(du -sh "$dst" | cut -f1)  $dst"
}

copy_minilm
copy_whisper
exit "$missing"
