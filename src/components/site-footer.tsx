import { SITE } from "@/lib/site";

const BUILT_WITH = [
  "Next.js",
  "TypeScript",
  "Tailwind",
  "Rust → WASM",
  "C++ → WASM",
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto max-w-(--container-wide) px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <p className="font-display text-base font-semibold">{SITE.name}</p>
            <p className="mt-1 text-sm text-muted">{SITE.role}</p>
            <p className="mt-3 text-sm text-subtle">
              Currently building {SITE.nowBuilding}.
            </p>
          </div>

          <nav aria-label="Elsewhere">
            <ul className="flex flex-col gap-2 text-sm">
              {/* Same rule as the header's icon row: a URL still containing
                  CONFIRM is not rendered. check:links validates internal hrefs
                  only, so a placeholder would ship as a 404 with every gate
                  green. An absent link is a visible gap; a broken one is not. */}
              {([
                ["GitHub", SITE.github],
                ["LinkedIn", SITE.linkedin],
              ] as const)
                .filter(([, href]) => href.length > 0 && !href.includes("CONFIRM"))
                .map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent"
                      rel="me noreferrer"
                      target="_blank"
                    >
                      {label}
                    </a>
                  </li>
                ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-xs text-subtle">
          <p className="font-mono">{BUILT_WITH.join("  ·  ")}</p>
        </div>
      </div>
    </footer>
  );
}
