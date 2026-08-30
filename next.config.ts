import type { NextConfig } from "next";

/**
 * Response headers.
 *
 * Deliberately NOT set: `Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy`.
 * Those two enable `SharedArrayBuffer`, which WebAssembly *threads* require,
 * relevant later for the inference engine. They also break any cross-origin
 * embed that does not send CORP, so they get turned on when the engine actually
 * needs threads, not speculatively. The first WASM build is single-threaded with
 * SIMD, which needs neither.
 *
 * Also not set: a Content-Security-Policy. Doing CSP properly here means a
 * per-request nonce for the inline theme-bootstrap script, which forces every
 * page off the static path. That is a real trade worth making deliberately,
 * tracked, not forgotten.
 */
const securityHeaders = [
  // Stop browsers second-guessing declared content types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin cross-site, the full URL same-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here should ever be framed.
  { key: "X-Frame-Options", value: "DENY" },
  // Opt out of powerful APIs this site has no use for.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
