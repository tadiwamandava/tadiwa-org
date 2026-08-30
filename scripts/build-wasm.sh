#!/usr/bin/env bash
# Builds crates/hnsw to WebAssembly and places the two artefacts:
#   public/search/hnsw_bg.wasm   fetched at runtime
#   src/lib/search/hnsw-glue.js  imported by the engine
set -euo pipefail

cd crates/hnsw
wasm-pack build --target web --out-dir pkg --no-typescript --release
cd ../..

mkdir -p public/search src/lib/search
cp crates/hnsw/pkg/hnsw_bg.wasm public/search/
cp crates/hnsw/pkg/hnsw.js src/lib/search/hnsw-glue.js

# wasm-bindgen's `web` glue ends with a default-path branch:
#     module_or_path = new URL('hnsw_bg.wasm', import.meta.url)
# The engine ALWAYS passes an explicit URL, so that branch is dead, but it is
# a static specifier, so Turbopack tries to resolve it at build time and fails
# ("Module not found: Can't resolve 'hnsw_bg.wasm'"). Replacing it with a throw
# removes the specifier and turns a silent wrong-path fetch into a loud error.
python3 - <<'PY'
p = "src/lib/search/hnsw-glue.js"
s = open(p).read()
old = "module_or_path = new URL('hnsw_bg.wasm', import.meta.url);"
new = ("throw new Error('hnsw glue: call init({ module_or_path }) with an "
       "explicit URL, the bundled default path was removed at build time.');")
if old not in s:
    raise SystemExit("build-wasm: default-path branch not found; did wasm-bindgen change its output?")
open(p, "w").write(s.replace(old, new, 1))
print("  patched hnsw-glue.js (removed static wasm specifier)")
PY

echo "  wasm: $(wc -c < public/search/hnsw_bg.wasm) bytes raw, $(gzip -c public/search/hnsw_bg.wasm | wc -c) gzip"
