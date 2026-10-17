"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Caption, Panel, Readout, fmt } from "./parts";
import type { QueryRun } from "@/lib/search/stats";
import type { Chunk } from "@/lib/search/types";

/**
 * One query, with the bill attached.
 *
 * The default query needs no model. Every chunk's vector is already in the
 * payload, so "use this page as the query" is a real 384-dimensional query
 * point that costs nothing extra to obtain, the index answers it the same way
 * it would answer an embedded sentence, and the telemetry is the same
 * telemetry. Free text is the opt-in extra, because free text is the only part
 * of this that needs 22 MB of weights.
 *
 * The first hit of a by-example query is the example itself, at similarity
 * 1.00. That is not a bug and it is not hidden: it is what a self-query does,
 * and the note under the results says so.
 */

export function QueryPanel({
  chunks,
  corpusSize,
  run,
  selectedId,
  onSelectChunk,
  onSubmitText,
  modelState,
  onLoadModel,
}: {
  chunks: Chunk[];
  corpusSize: number;
  run: QueryRun | null;
  selectedId: number | null;
  onSelectChunk: (id: number) => void;
  onSubmitText: (text: string) => void;
  modelState: ModelState;
  onLoadModel: () => void;
}) {
  const projects = chunks.filter((c) => c.kind === "project");
  const posts = chunks.filter((c) => c.kind === "post");
  const exact = new Set(run?.exact ?? []);
  const misses = run ? run.hits.filter((h) => !exact.has(h.id)).length : 0;

  return (
    <>
      <Panel className="mt-6">
        <label className="block">
          <span className="text-2xs text-muted">
            Query vector
          </span>
          <select
            value={selectedId ?? ""}
            onChange={(e) => onSelectChunk(Number(e.target.value))}
            className="mt-2 w-full rounded-md border border-border-strong bg-bg px-3 py-2 text-sm text-text"
          >
            <optgroup label="Projects">
              {projects.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · {c.section}
                </option>
              ))}
            </optgroup>
            <optgroup label="Writing">
              {posts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · {c.section}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <p className="mt-2 text-xs leading-relaxed text-subtle">
          Any chunk&rsquo;s own vector, used as the query. No model required,
          these 384-dimensional vectors are in the 38 KB payload the page already
          fetched.
        </p>

        {run && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
              <Readout
                value={fmt.count(run.hops)}
                label="hops"
                title="Nodes popped from the candidate queue across every layer."
              />
              <Readout
                value={
                  <>
                    {fmt.count(run.distances)}
                    <span className="text-subtle"> / {fmt.count(corpusSize)}</span>
                  </>
                }
                label="distances vs full scan"
                title="Distance evaluations this query made, against what an exhaustive scan would have made."
              />
              <Readout
                value={fmt.micros(run.micros)}
                label={`wall clock · ef ${run.ef}`}
                title="Mean of 25 repeats of this exact query, timed as a batch."
              />
              <Readout
                value={misses === 0 ? "exact" : `${misses} off`}
                label={`vs scan top ${run.k}`}
                title="Whether the graph returned the same set the exhaustive scan did."
              />
            </div>

            <ol className="mt-5 divide-y divide-border border-t border-border">
              {run.hits.map((hit, i) => {
                const chunk = chunks[hit.id];
                if (!chunk) return null;
                const missed = !exact.has(hit.id);
                return (
                  <li key={`${hit.id}-${i}`} className="py-2.5">
                    <div className="flex items-baseline gap-3">
                      <span className="w-5 shrink-0 font-mono text-2xs text-subtle tabular-nums">
                        {i + 1}
                      </span>
                      <Link
                        href={chunk.url}
                        className="min-w-0 flex-1 truncate text-sm text-text hover:text-accent"
                      >
                        {chunk.title}
                        <span className="text-subtle"> · {chunk.section}</span>
                      </Link>
                      <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                        {hit.score.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 pl-8 text-xs leading-relaxed text-subtle">
                      {chunk.text}
                    </p>
                    {missed && (
                      <p className="mt-1 pl-8 font-mono text-2xs text-muted">
                        not in the exhaustive scan&rsquo;s top {run.k}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>

            <Caption>
              Cosine similarity, 1.00 being identical.{" "}
              {run.source === "chunk"
                ? "Result 1 is the query chunk itself, a self-query returns its own vector first, every time. The neighbours below it are the answer worth looking at."
                : "The query was embedded in this tab and never left it."}{" "}
              {misses === 0
                ? `All ${run.k} match an exhaustive scan of the same vectors, so the approximation cost nothing here.`
                : `${misses} of ${run.k} differ from an exhaustive scan; that is the approximation, visible.`}
            </Caption>
          </>
        )}
      </Panel>

      <FreeText modelState={modelState} onLoadModel={onLoadModel} onSubmitText={onSubmitText} />
    </>
  );
}

export type ModelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

function FreeText({
  modelState,
  onLoadModel,
  onSubmitText,
}: {
  modelState: ModelState;
  onLoadModel: () => void;
  onSubmitText: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Panel className="mt-4">
      <h3 className="text-2xs text-muted">
        Free text, optional
      </h3>

      {modelState.status === "ready" ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onSubmitText(text.trim());
          }}
        >
          <label className="sr-only" htmlFor="lab-free-text">
            Search this site semantically
          </label>
          <input
            id="lab-free-text"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="how is the storage engine kept crash-safe?"
            className="min-w-[14rem] flex-1 rounded-md border border-border-strong bg-bg px-3 py-2 text-sm text-text placeholder:text-subtle"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-2xs text-accent-contrast"
          >
            Embed &amp; search
          </button>
        </form>
      ) : (
        <>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Turning a sentence into a vector needs the embedding model:
            MiniLM-L6, int8-quantised, <strong className="font-medium">about 22 MB</strong>,
            served from this domain and run in this tab. Nothing above needs it,
            because those measurements use the document vectors already loaded,
            so this is a button and not a page load.
          </p>
          {modelState.status === "idle" && (
            <button
              type="button"
              onClick={onLoadModel}
              className="mt-3 rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-2xs text-text hover:border-accent hover:text-accent"
            >
              Load the model · 22 MB
            </button>
          )}
          {modelState.status === "loading" && (
            <p className="mt-3 font-mono text-2xs text-subtle">
              downloading and initialising the model…
            </p>
          )}
          {modelState.status === "error" && (
            <p className="mt-3 font-mono text-2xs text-muted" title={modelState.message}>
              the model did not load, {modelState.message}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
