import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated toolchain output — wasm-bindgen and Emscripten glue. Vendored,
    // machine-written, and not ours to style.
    "crates/**",
    "src/lib/search/hnsw-glue.js",
    "public/nano/**",
    "engines/**/.build/**",
  ]),
]);

export default eslintConfig;
