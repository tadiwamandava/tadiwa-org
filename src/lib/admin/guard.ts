/**
 * The admin gate. Read this before touching anything in src/app/admin.
 *
 * THREE MODES, decided entirely by configuration:
 *
 *   "off"    Neither secret is set and this is a production build. Every
 *            /admin route 404s and every write throws. This is the DEFAULT,
 *            and it is what an unconfigured deploy gets. Adding login did not
 *            change it.
 *
 *   "open"   Neither secret is set and this is `next dev`. Unchanged from
 *            before: the owner's own machine, no password, content lives in
 *            git and an edit becomes a commit.
 *
 *   "auth"   ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET are both set. A
 *            valid session cookie is required, in development too, so the
 *            login path is testable without deploying it.
 *
 * Configuration is the switch on purpose. An admin that is reachable because
 * someone forgot to set something is the failure mode worth designing out, so
 * the absence of config means off rather than open.
 *
 * THREE INDEPENDENT LAYERS, because a UI that does not render a button is not
 * a security boundary and Server Actions are reachable by anyone who can POST:
 *
 *   1. `src/app/admin/(protected)/layout.tsx` awaits `assertAdminAccess()`, so
 *      no protected page renders. /admin/login sits OUTSIDE that layout, which
 *      is the only reason a login form can be shown at all.
 *   2. Every Server Action in `src/app/admin/actions.ts` awaits it again as
 *      its first statement, before reading a single field of its input. Layer
 *      1 does not run for a direct POST, so this is the one that matters.
 *   3. `src/lib/admin/store-fs.ts` calls `assertWritesAllowed()` inside
 *      `write` and `create`, so even a mistake in layers 1 and 2 cannot reach
 *      the filesystem.
 *
 * `server-only` makes the import a build error from a client component, so the
 * check can never be bundled to the browser where it would mean nothing.
 */

import "server-only";
import { notFound, redirect } from "next/navigation";

import { authConfigured, hasSession } from "./auth.ts";

export type AdminMode = "off" | "open" | "auth";

export function adminMode(): AdminMode {
  if (authConfigured()) return "auth";
  return process.env.NODE_ENV === "development" ? "open" : "off";
}

/** True when the admin exists at all on this deployment. */
export function adminReachable(): boolean {
  return adminMode() !== "off";
}

/**
 * For protected pages and layouts.
 *
 * 404s when the admin does not exist here, so an unconfigured deploy gives
 * away nothing about what routes might be hiding. Redirects to the login form
 * when it does exist but this request has no session.
 */
export async function assertAdminAccess(): Promise<void> {
  const mode = adminMode();
  if (mode === "off") notFound();
  if (mode === "open") return;
  if (!(await hasSession())) redirect("/admin/login");
}

/**
 * For write paths. Throws rather than 404-ing, so a bug that reached this far
 * shows up as an error and not as a mysteriously blank page.
 */
export async function assertWritesAllowed(): Promise<void> {
  const mode = adminMode();
  if (mode === "off") {
    throw new Error(
      "Content writes are disabled. Set ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET, or run the dev server.",
    );
  }
  if (mode === "auth" && !(await hasSession())) {
    throw new Error("Not signed in.");
  }
}
