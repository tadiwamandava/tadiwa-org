"use client";

/**
 * The search-index rebuild button.
 *
 * The honesty requirement here is the whole point. `public/search/*` is
 * generated from the corpus, and editing content does not regenerate it — so
 * between a save and a rebuild, ⌘K is answering from an index that does not
 * match the site. Rather than hiding that, the button states it, shows when
 * the index was last built, and reports the script's real output when it runs.
 *
 * It is not automatic: the rebuild embeds the whole corpus through a local
 * transformer model and takes tens of seconds.
 */

import { startTransition, useActionState } from "react";

import { rebuildSearchAction } from "@/app/admin/actions";
import type { RebuildState } from "@/lib/admin/action-types";
import type { IndexStatus } from "@/lib/admin/search-index";
import { buttonClass, Panel } from "./ui";

function when(iso: string | undefined): string {
  if (!iso) return "never";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function RebuildSearch({ status }: { status: IndexStatus }) {
  const [state, run, pending] = useActionState<RebuildState | null, void>(
    rebuildSearchAction,
    null,
  );

  // The server's staleness reading is from page render; once a rebuild has
  // finished in this session, that reading is out of date and the fresh result
  // is the truth.
  const stale = state?.phase === "done" && state.ok ? false : status.stale;

  return (
    <Panel title="Search index" tone={stale ? "warn" : "plain"}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-text">
          {!status.built ? (
            <>
              <strong className="font-semibold">Never built.</strong> ⌘K search has nothing to
              read.
            </>
          ) : stale ? (
            <>
              <strong className="font-semibold">Stale.</strong> Content has changed since the
              index was built, so search results are wrong until this runs.
            </>
          ) : (
            <>Up to date as of {when(status.indexBuiltAt)}.</>
          )}
        </p>
        <button
          type="button"
          className={`${buttonClass} ml-auto`}
          disabled={pending}
          onClick={() => startTransition(() => run())}
        >
          {pending ? "Rebuilding…" : "Rebuild index"}
        </button>
      </div>

      <p className="mt-1.5 text-xs text-subtle">
        Runs <code className="font-mono">npm run build:search</code>. Embeds the whole corpus
        locally — expect tens of seconds. Dev only.
      </p>

      {pending && (
        <p className="mt-2 text-xs text-muted" aria-live="polite">
          Running. The page stays usable; the result appears here when it finishes.
        </p>
      )}

      {state?.phase === "done" && (
        <div className="mt-2" aria-live="polite">
          <p className="text-sm text-text">
            {state.ok ? "Rebuilt" : "Failed"} in {(state.durationMs / 1000).toFixed(1)}s.
          </p>
          {state.output && (
            <pre className="mt-1.5 max-h-64 overflow-auto rounded-sm border border-border bg-bg p-2 font-mono text-2xs leading-relaxed text-muted">
              {state.output}
            </pre>
          )}
        </div>
      )}
    </Panel>
  );
}
