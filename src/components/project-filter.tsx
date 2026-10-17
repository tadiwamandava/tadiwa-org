import Link from "next/link";
import type { Project } from "@/lib/content/schema";

/**
 * Filter selection, mirrored 1:1 onto URL search params (`domain`, `lang`,
 * `status`). Deliberately single-valued per dimension, because combos like
 * `?domain=systems&lang=Rust` read as one clean filter to hand a recruiter,
 * and every link below can toggle a value on or off without any client JS.
 */
export type ProjectFilterState = {
  domain?: string;
  lang?: string;
};

type Option = { value: string; count: number };

/** Counts occurrences across a list of value-lists, e.g. every project's `domains`. */
function countBy<T extends string>(lists: readonly T[][]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const list of lists) {
    for (const value of list) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** Busiest first, alphabetical to break ties. Never a fixed list, so a new
 *  language or domain in a project's frontmatter shows up on its own. */
function sortedOptions(counts: Map<string, number>): Option[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Href for toggling one dimension, preserving the other two. Clicking the
 *  active chip again clears just that dimension. */
function hrefFor(
  selected: ProjectFilterState,
  key: keyof ProjectFilterState,
  value: string,
): string {
  const next: ProjectFilterState = {
    ...selected,
    [key]: selected[key] === value ? undefined : value,
  };
  const params = new URLSearchParams();
  if (next.domain) params.set("domain", next.domain);
  if (next.lang) params.set("lang", next.lang);
  const qs = params.toString();
  return qs ? `/projects?${qs}` : "/projects";
}

function FilterGroup({
  id,
  label,
  options,
  selectedValue,
  paramKey,
  selected,
}: {
  id: string;
  label: string;
  options: Option[];
  selectedValue?: string;
  paramKey: keyof ProjectFilterState;
  selected: ProjectFilterState;
}) {
  if (options.length === 0) return null;
  const headingId = `filter-${id}-heading`;

  return (
    // Label beside the chips rather than above them. Stacked, the three groups
    // cost ~230px of filtering UI above eleven projects, which is more chrome
    // than corpus. Inline, the same controls take about half that.
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-wrap items-baseline gap-x-4 gap-y-2 sm:flex-nowrap"
    >
      {/* h2, not h3: this sits directly under the page's <h1>, and skipping a
          level is a real WCAG heading-order violation. Lighthouse scored the
          route 98/100 on it. The visual size comes from the class, not the tag. */}
      <h2
        id={headingId}
        className="w-20 shrink-0 text-2xs tracking-[0.14em] text-subtle uppercase"
      >
        {label}
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {options.map(({ value, count }) => {
          const active = value === selectedValue;
          return (
            <li key={value}>
              <Link
                href={hrefFor(selected, paramKey, value)}
                aria-current={active ? "true" : undefined}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-2xs tracking-wide text-accent-contrast uppercase transition-colors"
                    // Border-only when inactive. Filled chips at this count
                    // (eleven languages) turn the top of the page into a wall
                    // of grey blocks that outweighs the work below it.
                    : "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-2xs tracking-wide text-subtle uppercase transition-colors hover:border-accent hover:text-text"
                }
              >
                {value}
                <span className="tabular-nums opacity-70">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Instrument-panel filter strip. Every option is a real `<Link>` whose href
 * already contains the resulting search params, so this renders correctly
 * with JavaScript disabled and adds no client bundle of its own. Next's
 * router still soft-navigates when JS is available, but nothing here depends
 * on it.
 *
 * Options and their counts are computed from `projects` (the full,
 * unfiltered corpus) so a new domain or language value in a project's
 * frontmatter appears automatically, and a value with zero projects behind
 * it never appears at all.
 */
export function ProjectFilter({
  projects,
  selected,
}: {
  projects: Project[];
  selected: ProjectFilterState;
}) {
  const domainOptions = sortedOptions(countBy(projects.map((p) => p.domains)));
  const langOptions = sortedOptions(countBy(projects.map((p) => p.languages)));

  const hasActiveFilter = Boolean(selected.domain || selected.lang);

  return (
    <div className="mt-10 flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-y border-border py-5">
      <div className="flex w-full flex-col gap-2.5">
        <FilterGroup
          id="domain"
          label="Domain"
          options={domainOptions}
          selectedValue={selected.domain}
          paramKey="domain"
          selected={selected}
        />
        <FilterGroup
          id="lang"
          label="Language"
          options={langOptions}
          selectedValue={selected.lang}
          paramKey="lang"
          selected={selected}
        />
      </div>

      {hasActiveFilter && (
        <Link
          href="/projects"
          className="shrink-0 text-2xs tracking-wide text-accent uppercase underline decoration-dotted underline-offset-4 transition-colors hover:text-text"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}
