import type { BenchmarkSet } from "@/lib/content/schema";

/**
 * Benchmark comparison.
 *
 * Built as a real <table> that happens to render as bars, rather than an SVG
 * chart with an aria-label. That gets three things for free: assistive tech
 * reads actual tabular data, it prints, and it works with zero client JS —
 * which is why there is no hover tooltip. Everything a tooltip would reveal
 * (variance, per-run notes) is rendered inline instead.
 *
 * Colour is an emphasis hierarchy, not a categorical palette: your run is the
 * subject, reference implementations are context. Identity is never carried by
 * colour alone — reference rows are labelled in text.
 */
export function BenchmarkChart({ set }: { set: BenchmarkSet }) {
  const max = Math.max(...set.runs.map((r) => Math.abs(r.value)));
  const safeMax = max === 0 ? 1 : max;

  return (
    <figure className="rounded-lg border border-border bg-surface p-5">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-lg">{set.title}</h3>
        <p className="font-mono text-2xs text-subtle">
          {set.unit} · {set.higherIsBetter ? "higher is better" : "lower is better"}
        </p>
      </figcaption>

      {/* Legend — present because there are two mark types. */}
      <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-xs bg-chart-mine" aria-hidden />
          this project
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-xs bg-chart-reference" aria-hidden />
          reference implementation
        </span>
      </p>

      <table className="w-full border-collapse">
        <caption className="sr-only">
          {set.title}. Measured in {set.unit};{" "}
          {set.higherIsBetter ? "higher is better" : "lower is better"}.
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Implementation</th>
            <th scope="col">{set.unit}</th>
          </tr>
        </thead>
        <tbody>
          {set.runs.map((run) => {
            const pct = (Math.abs(run.value) / safeMax) * 100;
            return (
              <tr key={run.label} className="align-middle">
                <th
                  scope="row"
                  className="w-[32%] max-w-0 truncate py-1.5 pr-3 text-left text-sm font-normal"
                  title={run.label}
                >
                  {run.label}
                  {run.isReference && (
                    <span className="ml-1.5 font-mono text-2xs text-subtle">
                      ref
                    </span>
                  )}
                </th>

                <td className="py-1.5">
                  <div className="flex items-center gap-2.5">
                    {/* The bar. Rounded only on the growing end, anchored to the
                        baseline; a 2px surface gap comes from the row padding. */}
                    <div
                      className="h-3.5 min-w-[2px] rounded-r-[4px]"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: run.isReference
                          ? "var(--chart-reference)"
                          : "var(--chart-mine)",
                      }}
                      aria-hidden
                    />
                    <span className="shrink-0 font-mono text-sm tabular-nums">
                      {formatValue(run.value)}
                      {run.variance !== undefined && (
                        <span className="text-subtle">
                          {" ±"}
                          {formatValue(run.variance)}
                        </span>
                      )}
                    </span>
                  </div>
                  {run.note && (
                    <p className="mt-0.5 text-2xs text-subtle">{run.note}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="mt-5 space-y-2.5 border-t border-border pt-4 text-xs leading-relaxed">
        <Row label="Hardware">{set.hardware}</Row>
        <Row label="Method">{set.methodology}</Row>
        <Row label="Measured">{set.measuredOn}</Row>
      </dl>

      {/* The honest paragraph. §2.3: honest gap analysis reads as competence;
          suspicious victory claims read as fabrication. */}
      <div className="mt-4 border-l-2 border-border-strong pl-4">
        <p className="mb-1 font-mono text-2xs tracking-[0.12em] text-muted uppercase">
          Why the gap
        </p>
        <p className="text-sm leading-relaxed text-muted">{set.gapAnalysis}</p>
      </div>
    </figure>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3">
      <dt className="font-mono text-2xs tracking-wide text-subtle uppercase">
        {label}
      </dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

/** Compact but unambiguous: 412000 → 412K, 8.4 → 8.4. */
function formatValue(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  if (abs >= 10) return n.toFixed(0);
  return n.toFixed(1);
}
