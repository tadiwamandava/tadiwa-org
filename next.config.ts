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
  //
  // `microphone=(self)`, NOT `microphone=()`. The empty allowlist disables the
  // feature for every origin including this one, so getUserMedia rejected with
  // NotAllowedError on the site's own voice assistant while the browser
  // permission itself reported "granted". Diagnosed with
  // document.featurePolicy.allowsFeature("microphone") returning false against
  // a granted permission state, which is the only signal that separates "the
  // user said no" from "the page forbade itself".
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  /**
   * Standalone output, for the container.
   *
   * Next traces the server's actual imports and emits a self-contained
   * .next/standalone with only the node_modules it reaches. The image is built
   * from that rather than from the repo, which is the difference between
   * shipping ~200 MB of dev dependencies and shipping the server.
   *
   * It does NOT copy `public/` or `.next/static`; the Dockerfile does that
   * explicitly. Forgetting either produces a site that boots and serves no CSS,
   * which looks like a styling bug rather than a packaging one.
   */
  output: "standalone",

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
