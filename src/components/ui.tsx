import Link from "next/link";
import type { ProjectFrontmatter } from "@/lib/content/schema";

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
    <div
      className={`mx-auto px-5 sm:px-8 ${wide ? "max-w-(--container-wide)" : "max-w-3xl"} ${className}`}
    >
      {children}
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
    <section id={id} className="scroll-mt-24 border-t border-border pt-14 sm:pt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="font-mono text-2xs tracking-wide text-accent uppercase underline decoration-dotted underline-offset-4 transition-colors hover:text-text"
          >
            {action.label} →
          </Link>
        )}
      </div>
      {lead && (
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted">{lead}</p>
      )}
      <div className="mt-8">{children}</div>
    </section>
  );
}

const STATUS_COPY = {
  shipped: { label: "Shipped", cls: "text-shipped" },
  building: { label: "Building", cls: "text-building" },
  planned: { label: "Planned", cls: "text-planned" },
} as const;

export function StatusPill({
  status,
}: {
  status: ProjectFrontmatter["status"];
}) {
  const { label, cls } = STATUS_COPY[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-2xs tracking-wide uppercase ${cls}`}
    >
      <span
        className="size-1.5 rounded-full bg-current"
        aria-hidden
        // A pulsing dot on in-flight work reads as "this is live", but it is
        // decoration, so it is hidden from assistive tech and respects
        // reduced-motion via the global rule.
        style={
          status === "building"
            ? { animation: "pulse-dot 2.4s ease-in-out infinite" }
            : undefined
        }
      />
      {label}
    </span>
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
      <h2 className="font-mono text-xs tracking-[0.14em] text-muted uppercase">
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
  return (
    <div title={title}>
      <div className="font-mono text-xl font-medium text-text tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-subtle">{label}</div>
    </div>
  );
}
