import { Container } from "@/components/ui";
import { assertAdminAccess, adminMode } from "@/lib/admin/guard";
import { signOutAction } from "../actions";

/**
 * Guard layer 1 of 3.
 *
 * `assertAdminAccess()` 404s when the admin is off, and redirects to the login
 * form when it is on but this request carries no session. That makes the admin
 * invisible; it is NOT what makes it safe. A Server Action does not run
 * through a layout, so the checks in `src/app/admin/actions.ts` are the ones
 * standing between a hand-written POST and the filesystem.
 * See `src/lib/admin/guard.ts`.
 *
 * The route group keeps this off /admin/login, which has to render for someone
 * who is not signed in.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await assertAdminAccess();
  const mode = adminMode();

  return (
    <Container wide className="py-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="font-mono text-sm tracking-[0.14em] text-text uppercase">
            Content admin
          </h1>
          <p className="mt-1 text-xs text-subtle">
            {mode === "open"
              ? "Unauthenticated, because no admin secrets are set and this is the dev server. Edits are file writes; commit them."
              : "Signed in. Edits are file writes; commit them."}
          </p>
        </div>
        <nav aria-label="Admin" className="flex items-center gap-4">
          <a
            href="/admin"
            className="font-mono text-2xs tracking-wide text-muted uppercase underline decoration-dotted underline-offset-4 hover:text-accent"
          >
            Index
          </a>
          {mode === "auth" && (
            <form action={signOutAction}>
              <button
                type="submit"
                className="font-mono text-2xs tracking-wide text-muted uppercase underline decoration-dotted underline-offset-4 hover:text-accent"
              >
                Sign out
              </button>
            </form>
          )}
        </nav>
      </div>
      {children}
    </Container>
  );
}
