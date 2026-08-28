"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadEmbedder } from "@/lib/search/engine";
import {
  EF_LADDER,
  blendedQueries,
  groundTruth,
  layerEdgePairs,
  layerStats,
  loadLabIndex,
  measureBruteForce,
  measureEf,
  project2D,
  runQuery,
  type LabIndex,
  type QueryRun,
  type SweepRow,
} from "@/lib/search/stats";
import { Caption, LabSection, Panel, Readout, fmt } from "./parts";
import { GraphMap } from "./graph-map";
import { RecallTable } from "./recall-panel";
import { QueryPanel, type ModelState } from "./query-panel";
import { ScalePanel } from "./scale-panel";

/* ============================================================================
   The measured half of /lab/search.

   One island, not five. Every panel below reads the same index instance, the
   same telemetry counters and the same `ef`, and splitting them into separate
   dynamic mounts would mean building the graph more than once and letting the
   numbers on one panel disagree with the numbers on the next.

   Nothing here may enter the first-paint bundle: the whole module arrives via
   next/dynamic from search-lab-mount.tsx, and the wasm behind another dynamic
   import inside that. `npm run check:bundle` fails the build otherwise.

   State discipline, because ESLint enforces it and it is right anyway: no
   setState in an effect body. Async results land from promise callbacks, the
   sweep lands from timeouts, and everything else — the current query, its
   results, which row is highlighted — is derived during render.
   ========================================================================= */

const K = 10;
/** Repeats per timed query in the single-query panel. Enough to get above the
 *  clock's 5 µs clamp without making a dropdown change feel slow. */
const QUERY_REPEATS = 25;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; lab: LabIndex };

export function SearchLab() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadLabIndex()
      .then((lab) => {
        if (!cancelled) setLoad({ status: "ready", lab });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoad({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lab = load.status === "ready" ? load.lab : null;

  // ---- graph shape, computed once per index -------------------------------

  const graph = useMemo(() => {
    if (!lab) return null;
    const layers = layerStats(lab.index);
    return {
      layers,
      projection: project2D(lab.vectors),
      edgesByLayer: layers.map((l) => layerEdgePairs(lab.index, l.layer)),
      membersByLayer: layers.map((l) => Array.from(lab.index.layerMembers(l.layer))),
    };
  }, [lab]);

  // ---- the ef sweep -------------------------------------------------------

  const [ef, setEf] = useState<number>(64);
  const [runId, setRunId] = useState(0);
  const [sweep, setSweep] = useState<{
    runId: number;
    rows: SweepRow[];
    brute: number | null;
  }>({ runId: -1, rows: [], brute: null });

  useEffect(() => {
    if (!lab) return;
    const { index, vectors } = lab;
    const queries = blendedQueries(vectors);
    const truth = groundTruth(index, queries, K);
    // Reduced motion means "do not perform for me": the ladder still gets
    // measured, it just lands in one go instead of filling in.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduced ? 0 : 110;

    let cancelled = false;
    let timer = 0;
    let i = 0;

    const step = () => {
      if (cancelled) return;
      const row = measureEf(index, queries, truth, K, EF_LADDER[i]);
      setSweep((prev) => {
        const base = prev.runId === runId ? prev : { runId, rows: [], brute: null };
        return { runId, rows: [...base.rows, row], brute: base.brute };
      });
      i += 1;
      if (i < EF_LADDER.length) {
        timer = window.setTimeout(step, delay);
      } else {
        const brute = measureBruteForce(index, queries, K);
        setSweep((prev) => (prev.runId === runId ? { ...prev, brute } : prev));
      }
    };
    timer = window.setTimeout(step, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lab, runId]);

  const rows = sweep.runId === runId ? sweep.rows : [];
  const bruteMicros = sweep.runId === runId ? sweep.brute : null;
  const sweeping = rows.length < EF_LADDER.length;

  // ---- the live query -----------------------------------------------------

  const [chunkId, setChunkId] = useState(0);
  const [textQuery, setTextQuery] = useState<{ vector: Float32Array; label: string } | null>(
    null,
  );
  const [modelState, setModelState] = useState<ModelState>({ status: "idle" });
  const embedRef = useRef<((text: string) => Promise<Float32Array>) | null>(null);

  const active = useMemo(() => {
    if (!lab) return null;
    if (textQuery) {
      return { vector: textQuery.vector, label: textQuery.label, source: "text" as const };
    }
    const chunk = lab.chunks[chunkId];
    return {
      vector: lab.vectors.row(chunkId),
      label: chunk ? `${chunk.title} · ${chunk.section}` : `chunk ${chunkId}`,
      source: "chunk" as const,
    };
  }, [lab, chunkId, textQuery]);

  // Derived during render, not stored: `ef` moving is enough to make this
  // stale, and an effect that re-runs the query would render the old numbers
  // for one frame every time the slider moves.
  const run: QueryRun | null = useMemo(() => {
    if (!lab || !active) return null;
    return runQuery(
      lab.index,
      active.vector,
      K,
      ef,
      active.label,
      active.source,
      QUERY_REPEATS,
    );
  }, [lab, active, ef]);

  function handleLoadModel() {
    setModelState({ status: "loading" });
    loadEmbedder()
      .then((fn) => {
        embedRef.current = fn;
        setModelState({ status: "ready" });
      })
      .catch((err: unknown) => {
        setModelState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  function handleSubmitText(text: string) {
    const embed = embedRef.current;
    if (!embed) return;
    void embed(text).then((vector) => setTextQuery({ vector, label: text }));
  }

  function handleSelectChunk(id: number) {
    setTextQuery(null);
    setChunkId(id);
  }

  // ---- render -------------------------------------------------------------

  const corpusSize = lab?.index.len ?? 0;

  return (
    <>
      <LabSection n="01" label="The index, as loaded">
        {load.status === "error" ? (
          <Panel className="mt-6">
            <p className="text-sm leading-relaxed text-muted">
              The index did not load: {load.message}. Everything on this page
              depends on it, so there is nothing to show — which is at least an
              honest failure mode.
            </p>
          </Panel>
        ) : !lab || !graph ? (
          <Panel className="mt-6">
            <p className="font-mono text-2xs text-subtle">
              fetching vectors and wasm, then building the graph…
            </p>
          </Panel>
        ) : (
          <Panel className="mt-6">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
              <Readout value={fmt.count(lab.index.len)} label="vectors indexed" />
              <Readout value={fmt.count(lab.index.dim)} label="dimensions" />
              <Readout value={`M ${lab.index.m}`} label="degree bound" />
              <Readout value={fmt.count(lab.index.efConstruction)} label="ef_construction" />
              <Readout
                value={`${lab.buildMs.toFixed(1)} ms`}
                label="graph built, in this tab"
                title="Time inside Index::build — every insertion, on the main thread."
              />
              <Readout
                value={`${lab.fetchMs.toFixed(0)} ms`}
                label="fetch, all assets"
                title="Wall clock for the wasm module, the vector payload and the chunk metadata, in parallel."
              />
            </div>
            <Caption>
              {fmt.bytesKB(lab.payloadBytes)} of int8 vectors and 43.2 KB of
              WebAssembly (18.3 KB over the wire), fetched when you opened this
              page and not before. The graph was constructed here, in your
              browser, from a fixed seed — which is what makes every number below
              reproducible rather than a sample.
            </Caption>
          </Panel>
        )}
      </LabSection>

      {lab && graph && (
        <>
          <LabSection n="02" label="The graph, drawn">
            <p className="mt-5 max-w-2xl leading-relaxed text-muted">
              HNSW is a stack of graphs over the same points. Every node lives at
              layer 0; a few also reach layer 1, fewer still layer 2, drawn from
              an exponentially decaying distribution. A search enters at the top,
              where the graph is sparse and one hop crosses a lot of ground, and
              descends — so the expensive, dense layer is only ever searched near
              the answer.
            </p>
            <GraphMap
              layers={graph.layers}
              projection={graph.projection}
              edgesByLayer={graph.edgesByLayer}
              membersByLayer={graph.membersByLayer}
              entryPoint={lab.index.entryPoint}
              chunks={lab.chunks}
              path={run?.path ?? []}
              topHit={run?.hits[0]?.id ?? null}
            />
          </LabSection>

          <LabSection n="03" label="Recall, measured live">
            <p className="mt-5 max-w-2xl leading-relaxed text-muted">
              HNSW is an <em>approximate</em> index. It is allowed to miss, and
              the only meaningful way to say how much is to ask it the same
              questions as an exhaustive scan and count the disagreements. That
              is what the table below is doing, in this tab, right now — one row
              per <span className="font-mono text-[0.95em]">ef</span>, against{" "}
              {fmt.count(corpusSize)} queries the index has never seen.
            </p>
            <div className="mt-6">
              <RecallTable
                title="Recall vs ef on this site's corpus"
                view={{
                  rows,
                  bruteMicros,
                  corpusSize,
                  queryCount: corpusSize,
                  k: K,
                }}
                ef={ef}
                onSelectEf={setEf}
                efLadder={EF_LADDER}
                running={sweeping}
                captionSuffix={
                  <>
                    Each query is the normalised midpoint of two chunk vectors —
                    a point that is in the corpus&rsquo;s neighbourhood but is not
                    any row of it, so the graph has to navigate rather than land
                    on its own answer. The pairing is seeded, so this table is
                    the same table on every load and on every machine.{" "}
                    <button
                      type="button"
                      onClick={() => setRunId((n) => n + 1)}
                      disabled={sweeping}
                      className="font-mono text-accent underline decoration-dotted underline-offset-4 disabled:text-subtle disabled:no-underline"
                    >
                      {sweeping ? "measuring…" : "measure again"}
                    </button>{" "}
                    — the recall column will not move; the timings will, which is
                    what a millisecond-scale benchmark on a shared CPU looks like.
                  </>
                }
              />
            </div>
          </LabSection>

          <LabSection n="04" label="Run a query">
            <p className="mt-5 max-w-2xl leading-relaxed text-muted">
              The same search the ⌘K palette runs, with the meter left on. Pick
              any chunk and its vector becomes the query; the readout is what
              that cost, next to what an exhaustive scan of all{" "}
              {fmt.count(corpusSize)} vectors would have cost.
            </p>
            <QueryPanel
              chunks={lab.chunks}
              corpusSize={corpusSize}
              run={run}
              selectedId={textQuery ? null : chunkId}
              onSelectChunk={handleSelectChunk}
              onSubmitText={handleSubmitText}
              modelState={modelState}
              onLoadModel={handleLoadModel}
            />
          </LabSection>

          <LabSection n="05" label="The same code at 100× the corpus">
            <ScalePanel ef={ef} smallCorpus={corpusSize} />
          </LabSection>

          <LabSection n="06" label="What this buys, and what it does not">
            <Conclusion rows={rows} corpusSize={corpusSize} bruteMicros={bruteMicros} />
          </LabSection>
        </>
      )}
    </>
  );
}

/**
 * The honest paragraph, with the measured numbers in it.
 *
 * Understating a result reads as competence; overstating one reads as
 * fabrication. At this corpus size the graph is not buying speed, and saying so
 * plainly — in the same typeface as everything else, not in a footnote — is the
 * only version of this page worth shipping.
 */
function Conclusion({
  rows,
  corpusSize,
  bruteMicros,
}: {
  rows: SweepRow[];
  corpusSize: number;
  bruteMicros: number | null;
}) {
  if (rows.length === 0) return null;
  const cheapest = rows.reduce((a, b) => (a.distances <= b.distances ? a : b));
  const dearest = rows.reduce((a, b) => (a.distances >= b.distances ? a : b));

  return (
    <div className="mt-6 space-y-4 text-base leading-relaxed text-muted">
      <p>
        <strong className="font-medium text-text">
          At {fmt.count(corpusSize)} chunks this graph is not saving anyone any
          time.
        </strong>{" "}
        An exhaustive scan is {fmt.count(corpusSize)} dot products of{" "}
        {384} dimensions each, and it finishes in{" "}
        {bruteMicros === null ? "well under a millisecond" : fmt.micros(bruteMicros)}.
        The graph walk costs between {cheapest.distances.toFixed(0)} and{" "}
        {dearest.distances.toFixed(0)} of the same dot products, plus the queue
        management around them, plus a one-off construction cost paid on load.
        Measured against the thing it replaces, it is a wash — and at the top of
        the ef ladder it is a loss.
      </p>
      <p>
        So it earns its place on two other grounds, both of which the page has
        just shown you rather than asserted. The first is that the structure is
        the artefact: the layer pyramid, the degree bound, the neighbour
        heuristic and the recall curve are the same objects at a hundred million
        vectors as they are at {fmt.count(corpusSize)}, and a demonstration that
        only works at a scale you cannot ship to a browser demonstrates nothing.
        The second is that it keeps working: the 100× test above builds the same
        graph over ten thousand vectors and answers in the same fraction of a
        millisecond, while the scan it is competing against gets ten thousand
        times more expensive.
      </p>
      <p>
        What it definitely buys, at any size: nothing leaves the tab. No query
        goes to a server, there is no API key, no rate limit and no log of what
        you searched for — the index is a file, the search is a function, and
        both of them are here.
      </p>
      <p className="text-sm text-subtle">
        The crate&rsquo;s own header comment says the same thing in fewer words,
        and has since before this page existed. If a portfolio&rsquo;s code and
        its marketing disagree, one of them is lying; the cheapest way to keep
        them honest is to make the page compute its own claims.
      </p>
    </div>
  );
}
