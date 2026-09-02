"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { getEngine } from "@/lib/search/engine";
import type { Hit, SearchMode } from "@/lib/search/types";

/**
 * ⌘K palette.
 *
 * Built on the native <dialog>: `showModal()` gives a real focus trap, an
 * inert background, and Escape-to-close from the platform. Hand-rolling those
 * three is the usual way an "accessible" command palette ends up not being one.
 *
 * Search is two-stage (see lib/search/engine.ts). The footer always states
 * which stage produced the list on screen.
 */

const ROUTES = [
  { label: "Projects", url: "/projects", hint: "All work" },
  { label: "Lab", url: "/lab", hint: "Things you can run" },
  { label: "Writing", url: "/writing", hint: "Posts" },
  { label: "Résumé", url: "/resume", hint: "Two variants" },
];

interface Row {
  key: string;
  title: string;
  sub: string;
  url: string;
  badge?: string;
}

export function CommandPalette() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The semantic pass IS async, so it lands in state, but from a promise
  // callback, never synchronously in an effect body. Declared up here
  // because hide() resets it.
  const [semanticRows, setSemanticRows] = useState<{ q: string; rows: Row[] } | null>(null);

  const engine = getEngine();
  const semantic = useSyncExternalStore(
    useCallback((cb: () => void) => engine.subscribe(cb), [engine]),
    () => engine.semantic,
    () => ({ status: "idle" }) as const,
  );

  // ---- open / close --------------------------------------------------------

  const show = useCallback(() => {
    triggerRef.current = document.activeElement;
    setOpen(true);
    dialogRef.current?.showModal();
    void engine.loadLexical();
  }, [engine]);

  const hide = useCallback(() => {
    setOpen(false);
    dialogRef.current?.close();
    setQuery("");
    setSemanticRows(null);
    (triggerRef.current as HTMLElement | null)?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) hide();
        else show();
      }
    }
    window.addEventListener("keydown", onKey);
    // The header button dispatches this rather than importing the component.
    const onOpen = () => show();
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, [show, hide]);

  // ---- results -------------------------------------------------------------

  // Re-render whenever the engine changes (index loaded, model ready, ...).
  const revision = useSyncExternalStore(
    useCallback((cb: () => void) => engine.subscribe(cb), [engine]),
    () => engine.revision,
    () => 0,
  );

  const toRows = useCallback(
    (hits: Hit[]): Row[] =>
      hits.map((h) => ({
        key: `${h.chunk.url}#${h.chunk.id}`,
        title: h.chunk.title,
        sub: h.chunk.text,
        url: h.chunk.url,
        badge: h.chunk.section.toLowerCase(),
      })),
    [],
  );

  const routeRows = useCallback(
    (q: string): Row[] =>
      ROUTES.filter((r) => r.label.toLowerCase().includes(q.toLowerCase())).map((r) => ({
        key: r.url,
        title: r.label,
        sub: r.hint,
        url: r.url,
        badge: "page",
      })),
    [],
  );

  // Computed DURING RENDER, not in an effect. `searchLexical` is synchronous,
  // so there is nothing to await, routing it through an effect would only add
  // a second render pass and a frame where the list is stale.
  const lexicalRows = useMemo<Row[]>(() => {
    if (!open) return [];
    void revision; // recompute once the index finishes loading
    const q = query.trim();
    if (q.length === 0) {
      return ROUTES.map((r) => ({ key: r.url, title: r.label, sub: r.hint, url: r.url }));
    }
    return [...routeRows(q), ...toRows(engine.searchLexical(q, 8))];
  }, [open, query, engine, revision, routeRows, toRows]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length === 0 || !engine.semanticReady) return;
    let cancelled = false;
    void engine.searchSemantic(q, 8).then((hits) => {
      if (!cancelled) setSemanticRows({ q, rows: [...routeRows(q), ...toRows(hits)] });
    });
    return () => {
      cancelled = true;
    };
  }, [open, query, engine, revision, routeRows, toRows]);

  const usingSemantic = semanticRows !== null && semanticRows.q === query.trim();
  const rows = usingSemantic ? semanticRows.rows : lexicalRows;
  const mode: SearchMode = usingSemantic ? "semantic" : "lexical";

  // `active` is stored WITH the query it belongs to, so a new query resets the
  // highlight by derivation instead of by an effect that fires a second render.
  const [activeState, setActiveState] = useState({ q: "", i: 0 });
  const active = activeState.q === query && activeState.i < rows.length ? activeState.i : 0;
  const setActive = useCallback(
    (updater: (i: number) => number) =>
      setActiveState((prev) => ({
        q: query,
        i: updater(prev.q === query ? prev.i : 0),
      })),
    [query],
  );

  // ---- keyboard ------------------------------------------------------------

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) {
        hide();
        router.push(row.url);
      }
    }
  }

  const modeLabel =
    semantic.status === "loading"
      ? `loading ${semantic.note}…`
      : mode === "semantic"
        ? "semantic · HNSW"
        : "lexical · BM25";

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search this site"
      onClose={hide}
      onClick={(e) => {
        if (e.target === dialogRef.current) hide();
      }}
      className="m-0 w-full max-w-xl rounded-lg border border-border bg-bg p-0 text-text backdrop:bg-text/40 sm:mt-[12vh] sm:ml-[50%] sm:-translate-x-1/2"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <SearchIcon />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search projects, decisions, writing…"
          aria-label="Search query"
          aria-controls="palette-results"
          className="w-full bg-transparent py-3.5 text-base outline-none placeholder:text-subtle"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-2xs text-subtle sm:block">
          esc
        </kbd>
      </div>

      <p className="sr-only" aria-live="polite">
        {rows.length} result{rows.length === 1 ? "" : "s"}
      </p>

      <ul id="palette-results" role="listbox" className="max-h-[52vh] overflow-y-auto py-1.5">
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-subtle">
            {engine.lexicalReady ? "Nothing matches that." : "Loading index…"}
          </li>
        )}
        {rows.map((row, i) => (
          <li key={row.key} role="option" aria-selected={i === active}>
            <button
              type="button"
              tabIndex={-1}
              onMouseMove={() => setActive(() => i)}
              onClick={() => {
                hide();
                router.push(row.url);
              }}
              className={`flex w-full items-start gap-3 px-4 py-2 text-left ${
                i === active ? "bg-surface-2" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{row.title}</span>
                <span className="mt-0.5 block truncate text-xs text-subtle">{row.sub}</span>
              </span>
              {row.badge && (
                <span className="mt-0.5 shrink-0 font-mono text-2xs text-subtle">{row.badge}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
        <span className="font-mono text-2xs text-subtle">{modeLabel}</span>
        {semantic.status === "idle" && (
          <button
            type="button"
            onClick={() => void engine.loadSemantic()}
            className="font-mono text-2xs text-accent underline decoration-dotted underline-offset-4"
          >
            enable semantic search (22 MB, runs locally)
          </button>
        )}
        {semantic.status === "error" && (
          // The reason rides along in `title`: a bare "unavailable" is useless
          // to anyone trying to work out whether it is their network, their
          // browser, or the site.
          <span
            className="font-mono text-2xs text-subtle"
            title={semantic.message}
            data-error={semantic.message}
          >
            semantic unavailable
          </span>
        )}
        {semantic.status === "ready" && (
          <span className="font-mono text-2xs text-subtle">
            {semantic.chunks} chunks · ready in {(semantic.buildMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </dialog>
  );
}

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="shrink-0 text-subtle"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" strokeLinecap="round" />
    </svg>
  );
}
