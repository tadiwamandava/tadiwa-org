import Link from "next/link";
import { NAV, SITE } from "@/lib/site";
import { ThemeToggle } from "./theme-toggle";
import { SearchTrigger } from "./search/search-trigger";
import { NavLink } from "./nav-link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-(--container-wide) items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight whitespace-nowrap"
        >
          {SITE.name.split(" ")[0]}
          <span className="text-accent">.</span>
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

        <SearchTrigger />
        <ThemeToggle />
      </div>
    </header>
  );
}
