import Link from "next/link";

/**
 * The page measure.
 *
 * Both variants share ONE outer column, so every page starts at the same left
 * edge as the header. The narrow variant caps the line length inside that
 * column rather than centring a second, narrower column of its own.
 *
 * Centring it independently is what the first version did, and it put the
 * header at x=98 and the body of six pages at x=248 on a 1200px viewport. Two
 * left edges 150px apart is the single most legible sign that a layout was
 * assembled rather than designed, and it is invisible while editing any one
 * page on its own.
 */
export function Container({
  children,
  wide = false,
  className = "",
}: {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-(--container-wide) px-5 sm:px-8 ${wide ? className : ""}`}>
      {wide ? children : <div className={`max-w-3xl ${className}`}>{children}</div>}
    </div>
  );
}

/**
 * One stacked section of the home page.
 *
 * The rhythm is the whole point of this layout: a large left-aligned heading,
 * one paragraph saying what the section is, the content, and a lot of air
 * before the next one. The gap is deliberately larger than feels comfortable
 * while editing, because a reader scrolling past at speed needs the break to
 * register as "new topic" rather than "next paragraph".
 */
export function PageSection({
  id,
  title,
  lead,
  action,
  children,
}: {
  id: string;
  title: string;
  lead?: React.ReactNode;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 pt-10 sm:pt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="text-2xs text-accent underline decoration-dotted underline-offset-4 transition-colors hover:text-text"
          >
            {action.label} →
          </Link>
        )}
      </div>
      {lead && (
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted">{lead}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Section heading with a hairline rule, used across index pages. */
export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-2">
      <h2 className="text-xs text-muted">
        {children}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="text-sm text-muted transition-colors hover:text-accent"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/** Card-face metric. Numbers, not adjectives. */
export function MetricStat({
  value,
  label,
  title,
}: {
  value: string;
  label: string;
  title?: string;
}) {
  // An unfilled metric renders as an unfilled metric, not as a headline number
  // whose value happens to be the word TODO. Setting it at display size in the
  // same weight as a real figure is how "TODO / active users" ends up looking
  // like a shipped statistic on a project card.
  const pending = /^(TODO|CONFIRM)\b/i.test(value);
  return (
    <div title={title}>
      <div
        className={
          pending
            ? "rounded border border-dashed border-border-strong px-1.5 py-0.5 text-2xs text-subtle"
            : "font-mono text-xl font-medium text-text tabular-nums"
        }
      >
        {pending ? "unset" : value}
      </div>
      <div className="mt-0.5 text-xs text-subtle">{label}</div>
    </div>
  );
}
