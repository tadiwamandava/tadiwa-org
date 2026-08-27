"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nav item that marks the active section.
 *
 * `aria-current="page"` is the part that matters: without it a screen-reader
 * user has no way to know which section they are in, since the visual cue is
 * colour and weight alone.
 */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded px-2.5 py-1.5 font-medium text-text"
          : "rounded px-2.5 py-1.5 text-muted transition-colors hover:text-text"
      }
    >
      {children}
    </Link>
  );
}
