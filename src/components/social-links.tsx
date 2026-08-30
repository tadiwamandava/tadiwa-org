import { SITE } from "@/lib/site";

/**
 * The icon row in the header.
 *
 * Hand-drawn inline SVG rather than an icon package: five glyphs do not justify
 * a dependency, and these ship as markup the server already renders instead of
 * a font or a sprite the browser has to fetch.
 *
 * A link whose URL still contains CONFIRM is NOT rendered. `check:links` only
 * validates internal hrefs, so a placeholder GitHub URL would sail past every
 * gate and ship as a 404 in the most clicked position on the page. An absent
 * icon is a visible gap; a broken one is a lie that looks fine.
 */

type Social = { label: string; href: string; path: React.ReactNode };

function icons(): Social[] {
  const out: Social[] = [];
  const usable = (v: string) => v.length > 0 && !v.includes("CONFIRM");

  if (usable(SITE.github)) {
    out.push({
      label: "GitHub",
      href: SITE.github,
      path: (
        <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3.1-1.8 3.8-3.6 4 .3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" />
      ),
    });
  }
  if (usable(SITE.linkedin)) {
    out.push({
      label: "LinkedIn",
      href: SITE.linkedin,
      path: (
        <path d="M13.6 0H2.4A2.4 2.4 0 0 0 0 2.4v11.2A2.4 2.4 0 0 0 2.4 16h11.2a2.4 2.4 0 0 0 2.4-2.4V2.4A2.4 2.4 0 0 0 13.6 0ZM5 13.4H2.7V6.2H5v7.2ZM3.8 5.2a1.3 1.3 0 1 1 0-2.7 1.3 1.3 0 0 1 0 2.7Zm9.6 8.2h-2.3V9.9c0-.9 0-2-1.2-2s-1.4 1-1.4 1.9v3.6H6.2V6.2h2.2v1h.1c.3-.6 1-1.2 2.1-1.2 2.3 0 2.8 1.5 2.8 3.5v3.9Z" />
      ),
    });
  }
  if (usable(SITE.email)) {
    out.push({
      label: "Email",
      href: `mailto:${SITE.email}`,
      path: (
        <path d="M1.5 2.5h13a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm.6 1.6L8 8.6l5.9-4.5H2.1Zm-.1 1.4v6.9h13V5.5L8 10 1.9 5.5Z" />
      ),
    });
  }
  return out;
}

export function SocialLinks({ className = "" }: { className?: string }) {
  const links = icons();
  if (links.length === 0) return null;

  return (
    <ul className={`flex items-center gap-1.5 ${className}`}>
      {links.map((s) => (
        <li key={s.label}>
          <a
            href={s.href}
            target="_blank"
            rel="me noreferrer"
            aria-label={s.label}
            className="flex size-9 items-center justify-center rounded-md border border-border text-subtle transition-colors hover:border-border-strong hover:text-text"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="size-4">
              {s.path}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
