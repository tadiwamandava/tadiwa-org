/**
 * Lighthouse CI gate.
 *
 * `.cjs`, not `.js`: package.json declares `"type": "module"`, and LHCI loads
 * this file with a plain `require()` regardless, a `.js` file would be
 * resolved as ESM by Node under that setting and `require()` would throw.
 * `.cjs` sidesteps the ambiguity.
 *
 * `next build` no longer prints a bundle-size table Next 16 removed the
 * `size` / `First Load JS` columns because the team found them inaccurate
 * for RSC architectures, so bundle weight is checked separately by
 * `scripts/check-bundle.ts`. This file covers what a build log can't show at
 * all: what actually happens in a browser, paint timing, layout shift, and
 * the Lighthouse category scores, against a real production server.
 *
 * THRESHOLDS ARE MEASURED, NOT INVENTED. Every number below came from running
 * `npx lighthouse` three times per route against a real `next build` +
 * `next start` on 2026-08-21, then setting the gate just past that reality.
 * An unmeasured threshold either never fires (set too loose) or fires on
 * every run (set to an aspirational number the framework can't hit), and
 * either way the gate stops being read within a week. Re-measure and update
 * these constants if the site's real numbers move, don't hand-tune them to
 * make a failing build pass.
 *
 * Measured (Slow-4G-simulated mobile, Lighthouse's default throttling,
 * deliberately not desktop, because that's the harsher, more honest
 * real-visitor case):
 *
 *   route                         perf   a11y   LCP      CLS
 *   /                              93    100    3.18s    0
 *   /projects                      93     98    3.16s    0    <- see note
 *   /projects/lsm-storage-engine   97    100    2.62s    0
 *   /writing                       98    100    2.48s    0
 *   /colophon                      96    100    2.77s    0
 *
 * NOTE on /projects' 98: that is a real, reproducible `heading-order`
 * violation (axe/Lighthouse), <ProjectFilter>'s filter-group labels render
 * as `<h3 id="filter-*-heading">` directly after the page's `<h1>`, with no
 * `<h2>` between them (src/components/project-filter.tsx). It is not
 * Lighthouse flake and it will not fix itself. Accessibility is still
 * asserted at a hard 100 below, on purpose: that is the one threshold this
 * file does NOT loosen to match reality. Until that heading is fixed, this
 * gate is SUPPOSED to fail on /projects; that is the gate doing its job,
 * not a false positive.
 */

const PORT = 3600;
const ROUTES = ["/", "/projects", "/projects/lsm-storage-engine", "/writing", "/colophon"];

module.exports = {
  ci: {
    collect: {
      url: ROUTES.map((route) => `http://localhost:${PORT}${route}`),
      // Self-contained on purpose: `npx lhci autorun` should work from a
      // clean checkout with no separate build step required. In CI this
      // duplicates the pipeline's own `npm run build`, but Turbopack's
      // incremental build off an already-warm `.next/cache` is cheap, and
      // "measure exactly what this command just built" is worth that cost.
      startServerCommand: `npm run build && npm start -- -p ${PORT}`,
      // Next 16's `next start` prints "✓ Ready in <ms>ms" once the server can
      // accept connections. The build's own output never contains that
      // string, so waiting for it can't false-trigger mid-build.
      startServerReadyPattern: "Ready in",
      // Generous on purpose: this window has to cover the build, not just
      // server boot, and a cold CI cache builds slower than a warm local one.
      startServerReadyTimeout: 120_000,
      // LHCI's own default. Three runs and the assertion compares against the
      // median, which is what keeps a single slow run from failing the build.
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        // Worst measured performance score was 93 (/, /projects). 90 gives
        // ~3 points of run-to-run headroom without hiding a real regression.
        "categories:performance": ["error", { minScore: 0.9 }],
        // Non-negotiable, not derived from the measurement above. See the
        // /projects note: this is meant to fail right now, until that
        // heading-order bug is fixed.
        "categories:accessibility": ["error", { minScore: 1 }],
        // Measured 100 on every route today; hold the line.
        "categories:best-practices": ["error", { minScore: 1 }],
        "categories:seo": ["error", { minScore: 1 }],
        // Worst measured LCP was 3.18s (/). 3.5s is ~10% of headroom above
        // that, small enough to catch a real regression, large enough that
        // normal network/CPU jitter in CI doesn't flap the build. (The
        // product brief's target is 1.2s; nothing in this stack is close to
        // that under Lighthouse's simulated-mobile throttling, and a gate set
        // to a number the site cannot pass is worse than no gate, see the
        // identical reasoning in scripts/check-bundle.ts for the 50KB JS
        // target.)
        "largest-contentful-paint": ["error", { maxNumericValue: 3500 }],
        // Measured exactly 0 on every route, every run. The 0.01 ceiling is
        // float-noise tolerance, not a loosened target, CLS 0 is the actual
        // bar.
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.01 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
