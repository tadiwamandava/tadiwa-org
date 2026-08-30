import { SITE } from "@/lib/site";

/**
 * The icon row in the header.
 *
 * Hand-drawn inline SVG rather than an icon package: five glyphs do not justify
 * a dependency, and these ship as markup the server already renders instead of
 * a font or a sprite the browser has to fetch.
 *
 * A link whose URL still contains CONFIRM never ships. `check:links` only
 * validates internal hrefs, so a placeholder GitHub URL would sail past every
 * gate and 404 in one of the most clicked positions on the page.
 *
 * In development it renders anyway, dimmed and unclickable, with the reason in
 * its tooltip. Silently omitting it in the editor is how you forget: the row
 * looks finished, and the gap only appears once the value is filled. Same
 * principle as the résumé's visible CONFIRM markers.
 */

type Social = {
  label: string;
  href: string;
  path: React.ReactNode;
  /** True when the URL is still a placeholder. Dev-only, never linked. */
  pending?: boolean;
};

function icons(): Social[] {
  const out: Social[] = [];
  const dev = process.env.NODE_ENV === "development";
  const usable = (v: string) => v.length > 0 && !v.includes("CONFIRM");
  const show = (v: string) => usable(v) || dev;

  if (show(SITE.github)) {
    out.push({
      label: "GitHub",
      pending: !usable(SITE.github),
      href: SITE.github,
      path: (
        <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3.1-1.8 3.8-3.6 4 .3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" />
      ),
    });
  }
  if (show(SITE.linkedin)) {
    out.push({
      label: "LinkedIn",
      pending: !usable(SITE.linkedin),
      href: SITE.linkedin,
      path: (
        <path d="M13.6 0H2.4A2.4 2.4 0 0 0 0 2.4v11.2A2.4 2.4 0 0 0 2.4 16h11.2a2.4 2.4 0 0 0 2.4-2.4V2.4A2.4 2.4 0 0 0 13.6 0ZM5 13.4H2.7V6.2H5v7.2ZM3.8 5.2a1.3 1.3 0 1 1 0-2.7 1.3 1.3 0 0 1 0 2.7Zm9.6 8.2h-2.3V9.9c0-.9 0-2-1.2-2s-1.4 1-1.4 1.9v3.6H6.2V6.2h2.2v1h.1c.3-.6 1-1.2 2.1-1.2 2.3 0 2.8 1.5 2.8 3.5v3.9Z" />
      ),
    });
  }
  if (show(SITE.email)) {
    out.push({
      label: "Email",
      pending: !usable(SITE.email),
      href: SITE.email ? `mailto:${SITE.email}` : "",
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
      {links.map((s) => {
        const glyph = (
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="size-4">
            {s.path}
          </svg>
        );
        return (
          <li key={s.label}>
            {s.pending ? (
              <span
                aria-hidden
                title={`${s.label} is still a CONFIRM placeholder in src/lib/site.ts. This icon is development-only and will not ship until the URL is set.`}
                className="flex size-9 cursor-not-allowed items-center justify-center rounded-md border border-dashed border-border-strong text-border-strong opacity-60"
              >
                {glyph}
              </span>
            ) : (
              <a
                href={s.href}
                target="_blank"
                rel="me noreferrer"
                aria-label={s.label}
                className="flex size-9 items-center justify-center rounded-md border border-border text-subtle transition-colors hover:border-border-strong hover:text-text"
              >
                {glyph}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
