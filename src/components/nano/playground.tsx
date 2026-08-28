"use client";

import { useCallback, useRef, useState } from "react";
import { NanoEngine, type Precision } from "./engine";

/**
 * The demo. Loads the engine on first use, then streams tokens.
 *
 * Nothing here runs until the visitor asks — the WASM and the weights are
 * behind this component's own dynamic import, and the weights fetch happens on
 * the first Generate.
 */

const PROMPTS = [
  "The engine is",
  "## Why this exists",
  "A crash-safe key-value store",
  "The honest answer is",
];

export function NanoPlayground() {
  const engineRef = useRef<NanoEngine | null>(null);
  const stopRef = useRef(false);

  const [precision, setPrecision] = useState<Precision>("int8");
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    tokens: number; ms: number; download: number; resident: number;
  } | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setOutput("");
    setStats(null);
    stopRef.current = false;
    try {
      const engine = (engineRef.current ??= new NanoEngine());
      if (engine.precision !== precision) {
        setStatus(`loading ${precision} weights…`);
        await engine.load(precision);
      }
      setStatus(null);

      const { tokens, ms } = await engine.generate(
        prompt, 260, 0.85, 0.95, 1234,
        (text) => setOutput((prev) => prev + text),
        () => stopRef.current,
      );
      setStats({
        tokens, ms,
        download: engine.info?.downloadBytes ?? 0,
        resident: engine.info?.weightBytes ?? 0,
      });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [precision, prompt]);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {/* ---- precision ------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-labelledby="prec-label">
          <span id="prec-label" className="mr-3 font-mono text-2xs tracking-wide text-subtle uppercase">
            Weights
          </span>
          {(["int8", "fp32"] as Precision[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrecision(p)}
              aria-pressed={precision === p}
              disabled={busy}
              className={`ml-1 rounded border px-2.5 py-1 font-mono text-2xs uppercase transition-colors disabled:opacity-50 ${
                precision === p
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border text-muted hover:border-border-strong"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="font-mono text-2xs text-subtle">
          {precision === "int8" ? "399 KB download" : "1.4 MB download"}
        </p>
      </div>

      {/* ---- prompt ------------------------------------------------------ */}
      <label htmlFor="nano-prompt" className="mt-5 block font-mono text-2xs tracking-wide text-subtle uppercase">
        Prompt
      </label>
      <textarea
        id="nano-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        disabled={busy}
        className="mt-2 w-full resize-y rounded border border-border-strong bg-bg p-3 font-mono text-sm text-text outline-none focus-visible:border-accent disabled:opacity-60"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrompt(p)}
            disabled={busy}
            className="rounded-sm bg-surface-2 px-2 py-1 font-mono text-2xs text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Generating…" : "Generate"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => { stopRef.current = true; }}
            className="rounded border border-border-strong px-3 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Stop
          </button>
        )}
        {status && <span className="font-mono text-2xs text-subtle">{status}</span>}
      </div>

      {/* ---- output ------------------------------------------------------ */}
      <div
        aria-live="polite"
        aria-label="Generated text"
        className="mt-5 min-h-[9rem] rounded border border-border bg-bg p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-text"
      >
        {output || (
          <span className="text-subtle">
            Output appears here, streamed one token at a time.
          </span>
        )}
      </div>

      {stats && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {[
            ["tok/s", (stats.tokens / (stats.ms / 1000)).toFixed(0)],
            ["ms/token", (stats.ms / Math.max(1, stats.tokens)).toFixed(2)],
            ["download", `${(stats.download / 1024).toFixed(0)} KB`],
            ["resident", `${(stats.resident / 1024).toFixed(0)} KB`],
          ].map(([k, v]) => (
            <div key={k}>
              <dd className="font-mono text-lg tabular-nums text-text">{v}</dd>
              <dt className="mt-0.5 font-mono text-2xs text-subtle">{k}</dt>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 text-xs leading-relaxed text-subtle">
        int8 is a <strong className="font-medium text-muted">wire</strong> saving,
        not a memory one: the weights are dequantised to fp32 on load, so
        &ldquo;resident&rdquo; is identical either way. Keeping them packed would
        need an int8 matmul kernel, which is the next rung rather than a free win
        — and reporting a memory saving that does not exist would be the easiest
        lie on this page.
      </p>
    </div>
  );
}
