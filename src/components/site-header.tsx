import Link from "next/link";
import { NAV, SITE } from "@/lib/site";
import { SearchTrigger } from "./search/search-trigger";
import { SocialLinks } from "./social-links";
import { NavLink } from "./nav-link";

/**
 * Name and one-line tagline on the left, controls on the right.
 *
 * The text nav stays, which the reference layout does not have. That is not an
 * oversight in either direction: the reference is a single page and has nowhere
 * to navigate to, while this site has five real routes plus every project
 * writeup. Dropping wayfinding to match a site that does not need it would be
 * copying a constraint rather than a design.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-(--container-wide) flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5 sm:px-8">
        <Link href="/" className="group leading-tight">
          <span className="block font-display text-lg font-semibold tracking-tight whitespace-nowrap">
            {SITE.name}
            <span className="text-accent">.</span>
          </span>
          <span className="block font-mono text-2xs tracking-wide text-subtle">
            {SITE.role}
          </span>
        </Link>

        <nav aria-label="Main" className="flex-1">
          <ul className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Search on top, the icon row under it, both right-aligned. */}
        <div className="flex flex-col items-end gap-2">
          <SearchTrigger />
          <SocialLinks className="hidden sm:flex" />
        </div>
      </div>
    </header>
  );
}
