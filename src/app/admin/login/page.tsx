import { redirect } from "next/navigation";

import { Container } from "@/components/ui";
import { authConfigProblem, hasSession } from "@/lib/admin/auth";
import { adminMode } from "@/lib/admin/guard";
import { LoginForm } from "./form";

/**
 * The one /admin route that renders without a session.
 *
 * It sits outside (protected), so nothing here may assume anything about the
 * caller. Two checks stand in for the guard the other routes get:
 *
 *   - mode "off": 404, the same as every other admin route on an unconfigured
 *     deployment. A login form on a site with no admin is an invitation.
 *   - mode "open": there is nothing to sign into, so send the visitor on.
 */
/**
 * Rendered per request, never prerendered.
 *
 * Without this it builds statically: with no secrets present at build time
 * `adminMode()` is "off", so it calls notFound() before ever touching cookies
 * and Next bakes a 404. A deployment that sets ADMIN_PASSWORD_HASH at runtime
 * would then serve that baked 404 forever, and the admin would look broken
 * rather than unconfigured.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const mode = adminMode();
  if (mode === "off") {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  if (mode === "open") redirect("/admin");
  if (await hasSession()) redirect("/admin");

  // Only ever non-null in development: production reaches this line only in
  // mode "auth", where by definition both secrets are present.
  const problem = process.env.NODE_ENV === "development" ? authConfigProblem() : null;

  return (
    <Container className="py-20">
      <h1 className="font-display text-3xl tracking-tight">Content admin</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        This is the editor for the files in <code className="font-mono">content/</code>.
        Everything it writes is a file in the repository, so an edit here is a
        change you still have to commit.
      </p>

      <LoginForm />

      {problem && (
        <p className="mt-6 rounded border border-dashed border-border-strong p-3 font-mono text-2xs leading-relaxed text-subtle">
          Development note: {problem}
        </p>
      )}
    </Container>
  );
}
