import type { Metadata } from "next";

import { Container } from "@/components/ui";
import { assertAdminEnabled } from "@/lib/admin/guard";

/**
 * Guard layer 1 of 3.
 *
 * In a production build `assertAdminEnabled()` calls `notFound()`, so every
 * route under /admin renders the 404 page and no admin markup is ever
 * produced. This is the layer that makes the admin invisible; it is NOT the
 * layer that makes it safe. A Server Action does not run through a layout, so
 * the checks in `src/app/admin/actions.ts` are the ones standing between a
 * hand-written POST and the filesystem. See `src/lib/admin/guard.ts`.
 */

export const metadata: Metadata = {
  title: "Admin",
  // Belt and braces: the routes 404 in production anyway, but if that ever
  // regresses, nothing here should be indexable.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  assertAdminEnabled();

  return (
    <Container wide className="py-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="font-mono text-sm tracking-[0.14em] text-text uppercase">
            Content admin
          </h1>
          <p className="mt-1 text-xs text-subtle">
            Local only. These routes 404 in a production build, and every write refuses outside
            the dev server. Edits are file writes; commit them.
          </p>
        </div>
        <nav aria-label="Admin">
          <a
            href="/admin"
            className="font-mono text-2xs tracking-wide text-muted uppercase underline decoration-dotted underline-offset-4 hover:text-accent"
          >
            Index
          </a>
        </nav>
      </div>
      {children}
    </Container>
  );
}
