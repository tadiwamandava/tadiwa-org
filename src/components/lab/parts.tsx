/**
 * Shared furniture for /lab/search.
 *
 * No "use client": these are plain functions of their props, so the server
 * page and the measured island can both use them and the section headings
 * match on either side of the boundary.
 *
 * The bar primitive follows src/components/benchmark-chart.tsx deliberately,
 * a real <table> that renders as bars, not an SVG with an aria-label. Screen
 * readers get tabular data; it prints, and the numbers are always beside the
 * bar so nothing is carried by colour or length alone.
 */

export function LabSection({
  n,
  label,
  title,
  children,
}: {
  n?: string;
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 scroll-mt-20 first:mt-0">
      <h2 className="flex items-baseline gap-3 border-b border-border pb-2 text-xs text-muted">
        {n && <span className="text-subtle tabular-nums">{n}</span>}
        {label}
      </h2>
      {title && (
        <p className="mt-5 font-display text-2xl leading-tight tracking-tight text-text">
          {title}
        </p>
      )}
      {children}
    </section>
  );
}

/** A measured bar. Always paired with its number in the adjacent cell. */
export function Bar({
  pct,
  tone = "mine",
}: {
  pct: number;
  tone?: "mine" | "reference";
}) {
  return (
    <div
      className="h-2.5 min-w-[2px] rounded-r-[3px]"
      style={{
        width: `${Math.max(0, Math.min(100, pct))}%`,
        backgroundColor: tone === "reference" ? "var(--chart-reference)" : "var(--chart-mine)",
      }}
      aria-hidden
    />
  );
}

/** The two-mark legend. Present wherever both tones appear in one table. */
export function ChartLegend({
  mine,
  reference,
}: {
  mine: string;
  reference: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-subtle">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-xs bg-chart-mine" aria-hidden />
        {mine}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-xs bg-chart-reference" aria-hidden />
        {reference}
      </span>
    </p>
  );
}

/** One number with a label under it. Used in the readout strips. */
export function Readout({
  value,
  label,
  title,
}: {
  value: React.ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <div title={title}>
      <div className="font-mono text-lg leading-snug font-medium text-text tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-2xs leading-snug text-subtle">{label}</div>
    </div>
  );
}

/** The small print under a figure, where the caveat goes. */
export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-subtle">{children}</p>;
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm border border-border bg-surface-2 px-1 py-px font-mono text-[0.86em] whitespace-nowrap">
      {children}
    </code>
  );
}

// ---- number formatting ----------------------------------------------------
// Everything compared to something else is rendered with the same number of
// decimals, so the eye can compare column-wise without re-reading each value.

export const fmt = {
  pct: (x: number) => `${(x * 100).toFixed(1)}%`,
  /** Microseconds, or milliseconds once they stop being readable as µs. */
  micros: (us: number) => (us >= 1000 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(1)} µs`),
  count: (n: number) => n.toLocaleString("en-US"),
  fixed1: (n: number) => n.toFixed(1),
  bytesKB: (b: number) => `${(b / 1000).toFixed(1)} KB`,
};
