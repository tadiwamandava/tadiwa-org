/**
 * The dev-only guard. Read this before touching anything in src/app/admin.
 *
 * WHY THERE IS NO LOGIN. This site is a public portfolio on a public host. An
 * authenticated, writable admin route deployed to the internet is a real
 * attack surface — a session store, a password reset path, a token to leak —
 * guarding content that is already public and already versioned in git. The
 * trade is bad, so the admin simply does not exist in a production build:
 * every /admin route returns 404, and every Server Action refuses.
 *
 * The owner reaches it with `npm run dev`, which is the correct workflow
 * anyway: content lives in git, and an edit should become a commit.
 *
 * THREE INDEPENDENT LAYERS, because a UI that does not render a button is not
 * a security boundary — Server Actions are reachable by anyone who can POST:
 *
 *   1. `src/app/admin/layout.tsx` calls `assertAdminEnabled()`, so no admin
 *      page renders.
 *   2. Every Server Action in `src/app/admin/actions.ts` calls it again as its
 *      first statement, before reading a single field of its input. Layer 1
 *      does not run for a direct POST, so this is the one that matters.
 *   3. `src/lib/admin/store-fs.ts` calls `assertWritesAllowed()` inside
 *      `write` and `create`, so even a mistake in layers 1 and 2 cannot reach
 *      the filesystem.
 *
 * `server-only` makes the import itself a build error from a client component,
 * so the check can never be bundled to the browser where it means nothing.
 */

import "server-only";
import { notFound } from "next/navigation";

/**
 * `NODE_ENV` is set by Next itself — "development" under `next dev`,
 * "production" under `next build` / `next start`. It is not a user-settable
 * env var in this setup, which is what makes it a usable gate.
 */
export const ADMIN_ENABLED = process.env.NODE_ENV === "development";

/** For pages and layouts: renders the 404 route. Never returns when disabled. */
export function assertAdminEnabled(): void {
  if (!ADMIN_ENABLED) notFound();
}

/**
 * For write paths. Throws rather than 404-ing, so a bug that reached this far
 * shows up as an error and not as a mysteriously blank page.
 */
export function assertWritesAllowed(): void {
  if (!ADMIN_ENABLED) {
    throw new Error("Content writes are only available in development (NODE_ENV=development).");
  }
}
