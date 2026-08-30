import type { Metadata } from "next";

/**
 * The OUTER admin layout. It deliberately does not guard.
 *
 * /admin/login has to render for someone who is not signed in, and a layout
 * wraps every route beneath it, so a guard here would either block the login
 * form or redirect it to itself forever. The guard lives one level down, in
 * (protected)/layout.tsx, and the route group keeps the URLs unchanged.
 *
 * All this layer does is make sure nothing under /admin is ever indexed.
 */
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminShell({ children }: LayoutProps<"/admin">) {
  return children;
}
