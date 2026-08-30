"use client";

import { Bar, Caption, ChartLegend, Panel, fmt } from "./parts";
import type { SweepRow } from "@/lib/search/stats";

/**
 * Recall, measured in front of you.
 *
 * HNSW is an APPROXIMATE index. It is allowed to miss, and a page that only
 * says "semantic search, powered by HNSW" is asking to be taken on trust about
 * the one property that actually matters. So every row here is computed in the
 * visitor's browser, against ground truth from `brute_force` over the same
 * vectors: the graph and the reference share their arithmetic, so any gap is
 * the approximation and not a float discrepancy.
 *
 * The verdict sentence under the table is generated from the measured rows
 * rather than written. If the corpus changes and the finding reverses, the
 * prose reverses with it.
 */

export interface SweepView {
  rows: SweepRow[];
  bruteMicros: number | null;
  corpusSize: number;
  queryCount: number;
  k: number;
}

export function RecallTable({
  view,
  ef,
  onSelectEf,
  efLadder,
  running,
  title,
  captionSuffix,
}: {
  view: SweepView;
  ef: number;
  onSelectEf?: (ef: number) => void;
  efLadder: readonly number[];
  running: boolean;
  title: string;
  captionSuffix?: React.ReactNode;
}) {
  const { rows, bruteMicros, corpusSize, k } = view;
  const maxDistances = Math.max(corpusSize, ...rows.map((r) => r.distances), 1);

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="font-display text-lg">{title}</h3>
        <p className="font-mono text-2xs text-subtle tabular-nums">
          k = {k} · {fmt.count(view.queryCount)} queries · {fmt.count(corpusSize)} vectors
        </p>
      </div>

      <div className="mt-4 mb-3">
        <ChartLegend mine="the graph" reference="exhaustive scan" />
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] border-collapse">
          <caption className="sr-only">
            Recall against exhaustive ground truth, mean distance evaluations per
            query, and mean time per query, as the search parameter ef increases.
          </caption>
          <thead>
            <tr className="border-b border-border text-left font-mono text-2xs text-subtle uppercase">
              <th scope="col" className="pb-2 pr-3 font-normal">
                ef
              </th>
              <th scope="col" className="pb-2 pr-3 font-normal">
                Recall@{k}
              </th>
              <th scope="col" className="w-[34%] pb-2 pr-3 font-normal">
                Distances / query
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Time / query
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.ef}
                aria-current={row.ef === ef ? "true" : undefined}
                className={row.ef === ef ? "bg-surface-2" : undefined}
              >
                <th
                  scope="row"
                  className="py-1.5 pr-3 text-left font-mono text-xs font-normal text-muted tabular-nums"
                >
                  {row.ef}
                  {row.ef === ef && <span className="sr-only"> (selected)</span>}
                </th>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="hidden min-w-[2.5rem] flex-1 sm:block">
                      <Bar pct={row.recall * 100} />
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {fmt.pct(row.recall)}
                    </span>
                  </div>
                </td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-[2px] flex-1">
                      <Bar pct={(row.distances / maxDistances) * 100} />
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {row.distances.toFixed(0)}
                    </span>
                  </div>
                </td>
                <td className="py-1.5 text-right font-mono text-xs text-muted tabular-nums">
                  {fmt.micros(row.micros)}
                </td>
              </tr>
            ))}

            {running && (
              <tr>
                <th
                  scope="row"
                  className="py-1.5 pr-3 text-left font-mono text-xs font-normal text-subtle tabular-nums"
                >
                  {efLadder[rows.length] ?? ""}
                </th>
                <td colSpan={3} className="py-1.5 font-mono text-2xs text-subtle">
                  measuring…
                </td>
              </tr>
            )}

            {bruteMicros !== null && (
              <tr className="border-t border-border">
                <th
                  scope="row"
                  className="py-1.5 pr-3 text-left font-mono text-2xs font-normal text-subtle uppercase"
                >
                  scan
                </th>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="hidden min-w-[2.5rem] flex-1 sm:block">
                      <Bar pct={100} tone="reference" />
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                      100.0%
                    </span>
                  </div>
                </td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-[2px] flex-1">
                      <Bar pct={(corpusSize / maxDistances) * 100} tone="reference" />
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                      {fmt.count(corpusSize)}
                    </span>
                  </div>
                </td>
                <td className="py-1.5 text-right font-mono text-xs text-muted tabular-nums">
                  {fmt.micros(bruteMicros)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {onSelectEf && (
        <EfSlider ef={ef} ladder={efLadder} onSelectEf={onSelectEf} disabled={running} />
      )}

      <p className="mt-4 text-sm leading-relaxed text-muted">
        <Verdict view={view} running={running} />
      </p>

      <Caption>
        Recall@{k} is the fraction of the true {k} nearest neighbours the graph
        returned, with truth from an exhaustive scan of the same vectors.
        &ldquo;Scan&rdquo; is that scan: 100% by definition, {fmt.count(corpusSize)}{" "}
        distance evaluations by construction. Times are a whole batch divided by
        the number of queries, <span className="font-mono">performance.now()</span>{" "}
        is clamped to about 5 µs in a browser that is not cross-origin isolated,
        so one query on its own is below the clock&rsquo;s resolution and timing it
        alone would report the clamp. {captionSuffix}
      </Caption>
    </Panel>
  );
}

function EfSlider({
  ef,
  ladder,
  onSelectEf,
  disabled,
}: {
  ef: number;
  ladder: readonly number[];
  onSelectEf: (ef: number) => void;
  disabled: boolean;
}) {
  const i = Math.max(0, ladder.indexOf(ef));
  return (
    <div className="mt-5 border-t border-border pt-4">
      <label className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-2xs tracking-[0.12em] text-muted uppercase">
          ef_search
        </span>
        <input
          type="range"
          min={0}
          max={ladder.length - 1}
          step={1}
          value={i}
          disabled={disabled}
          onChange={(e) => onSelectEf(ladder[Number(e.target.value)])}
          className="h-1.5 min-w-[12rem] flex-1 cursor-pointer accent-accent disabled:cursor-progress"
          aria-valuetext={`ef ${ef}`}
        />
        <output className="w-12 shrink-0 text-right font-mono text-sm text-text tabular-nums">
          {ef}
        </output>
      </label>
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        The size of the candidate list layer 0 keeps while it searches. It is the
        one accuracy/cost dial at query time; the graph is not rebuilt. The
        selected row is highlighted above, and the query below runs at this
        setting.
      </p>
    </div>
  );
}

/**
 * The finding, written from the numbers.
 *
 * Both branches are real outcomes: on a small corpus recall pins at 100% and
 * the honest thing to report is that it did, on a large one it climbs. Which
 * sentence appears is decided by the measurement, not by me.
 */
function Verdict({ view, running }: { view: SweepView; running: boolean }) {
  const { rows, corpusSize, k, bruteMicros } = view;
  if (rows.length < 2) return <>Measuring…</>;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const minDist = Math.min(...rows.map((r) => r.distances));
  const maxDist = Math.max(...rows.map((r) => r.distances));
  const perfect = rows.every((r) => r.recall >= 0.9999);
  const cheapest = rows.reduce((a, b) => (a.distances <= b.distances ? a : b));

  const ratio = corpusSize / Math.max(cheapest.distances, 1);
  const speedup = bruteMicros !== null ? bruteMicros / Math.max(cheapest.micros, 1e-6) : null;

  if (perfect) {
    return (
      <>
        <strong className="font-medium text-text">
          Recall does not move: every ef on the ladder returns all {k} true
          nearest neighbours, for all {fmt.count(view.queryCount)} queries.
        </strong>{" "}
        At {fmt.count(corpusSize)} vectors there is nowhere for it to go, the
        graph is dense enough relative to the corpus that layer 0&rsquo;s sweep
        reaches the whole answer. Cost still moves, and it moves the wrong way to
        be impressive: {minDist.toFixed(0)}–{maxDist.toFixed(0)} distance
        evaluations per query against the scan&rsquo;s {fmt.count(corpusSize)}.{" "}
        {maxDist > corpusSize
          ? "At the top of the ladder the graph does more arithmetic than the thing it replaces."
          : "The saving, where there is one, is small."}{" "}
        That is the honest read at this size, and it is the reason the section
        below exists.
        {running && " (still measuring)"}
      </>
    );
  }

  return (
    <>
      <strong className="font-medium text-text">
        Recall climbs from {fmt.pct(first.recall)} at ef&nbsp;{first.ef} to{" "}
        {fmt.pct(last.recall)} at ef&nbsp;{last.ef}, and the cost climbs with it:{" "}
        {first.distances.toFixed(0)} → {last.distances.toFixed(0)} distance
        evaluations per query.
      </strong>{" "}
      Against a full scan of {fmt.count(corpusSize)} vectors, the cheapest
      setting on the ladder touches {ratio.toFixed(0)}× fewer points
      {speedup !== null && speedup > 1 ? ` and runs ${speedup.toFixed(0)}× faster` : ""},
      and gives up {fmt.pct(1 - cheapest.recall)} of the true neighbours to do
      it. That trade is what an approximate index is; the only question is
      whether a page will show you the losing half of it.
      {running && " (still measuring)"}
    </>
  );
}
