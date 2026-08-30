"use client";

import { useEffect, useRef, useState } from "react";
import { Caption, Panel, Readout, fmt } from "./parts";
import { RecallTable } from "./recall-panel";
import type { ScaleMessage, ScaleRequest } from "@/lib/search/scale-worker";
import type { SweepRow } from "@/lib/search/stats";

/**
 * The same code at 100× the corpus.
 *
 * This exists because the honest finding on the real corpus, that 99 vectors
 * is too few for the graph to save any work, leaves a claim dangling: that it
 * would, at scale. Quoting a published benchmark for that would be exactly the
 * assertion this page refuses to make everywhere else, so the page builds the
 * bigger index instead, in the visitor's browser, from vectors it generates.
 *
 * IN A WORKER. `Index::build` over 10,000 vectors is one uninterruptible call
 * that takes seconds; on the main thread it is a frozen tab, and a frozen tab
 * on a page arguing for measurement reads as a page that crashed. Nothing is
 * downloaded for this, the vectors are synthesised locally, which is also why
 * they are synthetic and the copy says so.
 */

const CONFIG: ScaleRequest = { count: 10_000, dim: 384, k: 10, queries: 50 };
const LADDER = [10, 12, 16, 24, 32, 48, 64, 96, 128, 200] as const;

type Phase = "generating" | "building" | "measuring";

interface Built {
  buildMs: number;
  layerSizes: number[];
  count: number;
  dim: number;
}

type State =
  | { status: "idle" }
  | { status: "running"; phase: Phase; built: Built | null; rows: SweepRow[] }
  | { status: "done"; built: Built; rows: SweepRow[]; bruteMicros: number }
  | { status: "error"; message: string };

const PHASE_COPY: Record<Phase, string> = {
  generating: "generating 10,000 vectors",
  building: "inserting them into the graph",
  measuring: "sweeping ef against exhaustive ground truth",
};

export function ScalePanel({ ef, smallCorpus }: { ef: number; smallCorpus: number }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  // Terminate on unmount. A worker holding 15 MB of wasm memory after the
  // visitor has navigated away is a leak, even a short-lived one.
  useEffect(() => () => workerRef.current?.terminate(), []);

  const running = state.status === "running";
  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(id);
  }, [running]);

  function start() {
    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker(new URL("../../lib/search/scale-worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<ScaleMessage>) => {
      const msg = event.data;
      setState((prev) => {
        switch (msg.type) {
          case "phase":
            return {
              status: "running",
              phase: msg.phase,
              built: prev.status === "running" ? prev.built : null,
              rows: prev.status === "running" ? prev.rows : [],
            };
          case "built":
            return {
              status: "running",
              phase: "measuring",
              built: {
                buildMs: msg.buildMs,
                layerSizes: msg.layerSizes,
                count: msg.count,
                dim: msg.dim,
              },
              rows: prev.status === "running" ? prev.rows : [],
            };
          case "row":
            return prev.status === "running"
              ? { ...prev, rows: [...prev.rows, msg.row] }
              : prev;
          case "done":
            return prev.status === "running" && prev.built
              ? {
                  status: "done",
                  built: prev.built,
                  rows: prev.rows,
                  bruteMicros: msg.bruteMicros,
                }
              : prev;
          case "error":
            return { status: "error", message: msg.message };
        }
      });
    };
    worker.onerror = (e) =>
      setState({ status: "error", message: e.message || "the worker failed to start" });

    setState({ status: "running", phase: "generating", built: null, rows: [] });
    setElapsed(0);
    worker.postMessage(CONFIG);
  }

  if (state.status === "idle") {
    return (
      <Panel className="mt-6">
        <p className="max-w-2xl leading-relaxed text-muted">
          The claim that the graph earns its place at scale is not demonstrable
          on {fmt.count(smallCorpus)} chunks, and quoting somebody else&rsquo;s
          benchmark for it would be the kind of assertion the rest of this page
          refuses to make. So build the bigger index instead:{" "}
          {fmt.count(CONFIG.count)} vectors, {Math.round(CONFIG.count / smallCorpus)}×
          this corpus, at the same {CONFIG.dim} dimensions, through the same{" "}
          <code className="font-mono text-[0.9em]">Index::build</code>, measured
          the same way.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-subtle">
          The vectors are synthesised in your browser, not downloaded: nothing
          crosses the network for this. They are clustered gaussians rather than
          real text, because what is being measured is how the graph behaves as n
          grows, and that is a property of the algorithm. Building takes several
          seconds and runs in a worker, so this tab stays responsive.
        </p>
        <button
          type="button"
          onClick={start}
          className="mt-4 rounded-md border border-border-strong bg-surface-2 px-4 py-2 font-mono text-2xs tracking-wide text-text uppercase hover:border-accent hover:text-accent"
        >
          Build the {fmt.count(CONFIG.count)}-vector index
        </button>
      </Panel>
    );
  }

  if (state.status === "error") {
    return (
      <Panel className="mt-6">
        <p className="text-sm text-muted">
          The scale test did not run: {state.message}. Everything above is
          unaffected, it runs on the shipped index, which is already built.
        </p>
      </Panel>
    );
  }

  const built = state.status === "done" ? state.built : state.built;
  const rows = state.rows;

  return (
    <>
      <Panel className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h3 className="font-display text-lg">
            {fmt.count(CONFIG.count)} vectors, {CONFIG.dim} dimensions
          </h3>
          <p className="font-mono text-2xs text-subtle tabular-nums">
            {state.status === "running"
              ? `${PHASE_COPY[state.phase]} · ${elapsed.toFixed(1)}s`
              : "complete"}
          </p>
        </div>

        {built && (
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
            <Readout value={fmt.count(built.count)} label="vectors indexed" />
            <Readout
              value={`${(built.buildMs / 1000).toFixed(1)} s`}
              label="graph construction"
              title="Time inside Index::build, in a worker."
            />
            <Readout value={built.layerSizes.length.toString()} label="layers" />
            <Readout
              value={built.layerSizes.map((s) => fmt.count(s)).join(" · ")}
              label="nodes per layer, 0 first"
            />
          </div>
        )}

        {!built && (
          <p className="mt-4 text-sm text-muted">
            {PHASE_COPY[(state as { phase: Phase }).phase]}…
          </p>
        )}
      </Panel>

      {rows.length > 0 && (
        <div className="mt-4">
          <RecallTable
            title="Recall vs ef at 10,000 vectors"
            view={{
              rows,
              bruteMicros: state.status === "done" ? state.bruteMicros : null,
              corpusSize: CONFIG.count,
              queryCount: CONFIG.queries,
              k: CONFIG.k,
            }}
            ef={ef}
            efLadder={LADDER}
            running={state.status === "running" && rows.length < LADDER.length}
            captionSuffix={
              <>
                Measured in a worker on synthetic vectors, so these times are on
                the same hardware but not on the same thread as the numbers
                above.
              </>
            }
          />
        </div>
      )}

      {state.status === "done" && (
        <Caption>
          Same crate, same parameters, same measurement, only n changed. This is
          the regime the data structure was designed for, and it is also the
          regime this website is not in.
        </Caption>
      )}
    </>
  );
}
