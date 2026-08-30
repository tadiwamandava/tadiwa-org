"use client";

import { useCallback, useRef, useState } from "react";
import { NanoEngine, type Precision } from "./engine";
import { LlamaEngine, chatPrompt, type GenStats, type LoadProgress } from "./llama";

/**
 * The demo, for both models the engine can run.
 *
 * The point of the selector is the comparison, not the choice. One model is
 * 359K parameters trained here on 66 KB of prose and it produces mush; the
 * other is 135M parameters trained by somebody with a GPU cluster and it
 * answers questions. Same C++ forward pass, same WASM, same kernels — the
 * difference is entirely the weights, which is the thing a page like this
 * should demonstrate rather than assert.
 *
 * Nothing loads until asked: the WASM and both weight files sit behind this
 * component's dynamic import, and the 129 MB model needs an explicit click
 * with the cost shown next to it.
 */

export interface PlaygroundProps {
  /** Real byte count from disk, or null when the weights are served from
   *  another origin. Never a literal — see getSmolInfo(). */
  smolWeightBytes: number | null;
  smolParams: number | null;
  smolName: string | null;
  /** False when this deployment has no weights to serve and none configured
   *  elsewhere. The demo then offers only the small model and says why, rather
   *  than showing a Load button that 404s — the same rule the semantic search
   *  stage follows when its model is absent. */
  smolAvailable: boolean;
}

type ModelId = "smol" | "nano";
type Mode = "chat" | "complete";

const CHAT_PROMPTS = [
  "What is a transformer, in two sentences?",
  "Explain what a KV cache does.",
  "Write a haiku about a circuit board.",
  "Why is quantisation useful for running models in a browser?",
];

const COMPLETE_PROMPTS = [
  "The capital of France is",
  "In computer architecture, a pipeline hazard is",
  "def fibonacci(n):",
];

const NANO_PROMPTS = [
  "The engine is",
  "## Why this exists",
  "A crash-safe key-value store",
  "The honest answer is",
];

const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`;
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

export function NanoPlayground({
  smolWeightBytes, smolParams, smolName, smolAvailable,
}: PlaygroundProps) {
  const llamaRef = useRef<LlamaEngine | null>(null);
  const nanoRef = useRef<NanoEngine | null>(null);
  const stopRef = useRef(false);

  const [model, setModel] = useState<ModelId>(smolAvailable ? "smol" : "nano");
  const [mode, setMode] = useState<Mode>("chat");
  const [precision, setPrecision] = useState<Precision>("int8");

  const [chatText, setChatText] = useState(CHAT_PROMPTS[0]);
  const [completeText, setCompleteText] = useState(COMPLETE_PROMPTS[0]);
  const [nanoText, setNanoText] = useState(NANO_PROMPTS[0]);

  const [output, setOutput] = useState("");
  /** The prompt the running completion actually started from. Snapshotted at
   *  Generate rather than read live, so editing the box mid-stream cannot
   *  rewrite the text the model was continuing. */
  const [echoed, setEchoed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [prefill, setPrefill] = useState<{ done: number; total: number } | null>(null);
  const [smolReady, setSmolReady] = useState(false);
  const [stats, setStats] = useState<
    (GenStats & { resident: number; kv: number }) | null
  >(null);

  const prompt =
    model === "nano" ? nanoText : mode === "chat" ? chatText : completeText;
  const setPrompt =
    model === "nano" ? setNanoText : mode === "chat" ? setChatText : setCompleteText;
  const suggestions =
    model === "nano" ? NANO_PROMPTS : mode === "chat" ? CHAT_PROMPTS : COMPLETE_PROMPTS;

  const loadSmol = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const engine = (llamaRef.current ??= new LlamaEngine());
      await engine.load(setProgress);
      setSmolReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setOutput("");
    setStats(null);
    setError(null);
    setPrefill(null);
    setEchoed(model === "smol" && mode === "complete" ? prompt : null);
    stopRef.current = false;
    try {
      if (model === "nano") {
        const engine = (nanoRef.current ??= new NanoEngine());
        if (engine.precision !== precision) await engine.load(precision);
        const { tokens, ms } = await engine.generate(
          prompt, 260, 0.85, 0.95, 1234,
          (text) => setOutput((prev) => prev + text),
          () => stopRef.current,
        );
        setStats({
          promptTokens: 0, tokens, prefillMs: 0, genMs: ms, stopped: "limit",
          resident: engine.info?.weightBytes ?? 0, kv: 0,
        });
        return;
      }

      const engine = llamaRef.current;
      if (!engine?.loaded) throw new Error("model not loaded");
      const s = await engine.generate(
        mode === "chat" ? chatPrompt(prompt) : prompt,
        {
          maxTokens: 220,
          // Greedy in chat: a 135M model asked a factual question and given
          // temperature will confabulate more, not less, and the interesting
          // failure here is the model's, not the sampler's.
          temperature: mode === "chat" ? 0.0 : 0.8,
          topP: 0.9,
          repeatPenalty: 1.12,
          seed: 1234,
          stopAtEos: mode === "chat",
        },
        (done, total) => setPrefill({ done, total }),
        (text) => setOutput((prev) => prev + text),
        () => stopRef.current,
      );
      setStats({ ...s, resident: engine.info?.residentBytes ?? 0, kv: engine.info?.kvBytes ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrefill(null);
      setBusy(false);
    }
  }, [model, mode, precision, prompt]);

  const needsDownload = model === "smol" && !smolReady;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {/* ---- model ------------------------------------------------------- */}
      <div role="group" aria-labelledby="model-label">
        <span id="model-label" className="mb-2 block font-mono text-2xs tracking-wide text-subtle uppercase">
          Model
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          <ModelButton
            selected={model === "smol"}
            disabled={busy || !smolAvailable}
            onSelect={() => setModel("smol")}
            title={smolName ?? "SmolLM2-135M-Instruct"}
            detail={
              smolParams
                ? `${(smolParams / 1e6).toFixed(0)}M params · ${smolWeightBytes ? mb(smolWeightBytes) : "int8"}`
                : "int8"
            }
            note={
              !smolAvailable
                ? "not served by this deployment"
                : smolReady
                  ? "loaded"
                  : "one-time download"
            }
          />
          <ModelButton
            selected={model === "nano"}
            disabled={busy}
            onSelect={() => setModel("nano")}
            title="tadiwa-nano-359K"
            detail="359K params · 399 KB"
            note="trained here, on this site's prose"
          />
        </div>
      </div>

      {/* ---- mode / precision -------------------------------------------- */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        {model === "smol" ? (
          <Segmented
            label="Prompting"
            options={[
              ["chat", "Chat"],
              ["complete", "Complete"],
            ]}
            value={mode}
            disabled={busy}
            onChange={(v) => setMode(v as Mode)}
          />
        ) : (
          <Segmented
            label="Weights"
            options={[
              ["int8", "int8"],
              ["fp32", "fp32"],
            ]}
            value={precision}
            disabled={busy}
            onChange={(v) => setPrecision(v as Precision)}
          />
        )}
        <p className="max-w-md font-mono text-2xs leading-relaxed text-subtle">
          {model === "nano"
            ? precision === "int8"
              ? "399 KB download"
              : "1.4 MB download"
            : mode === "chat"
              ? "Wrapped in the <|im_start|> turn structure it was fine-tuned on, and stopped at <|im_end|>."
              : "Fed in verbatim. No template, no stop token — it just continues the text."}
        </p>
      </div>

      {/* ---- the download gate ------------------------------------------- */}
      {needsDownload ? (
        <div className="mt-5 rounded border border-dashed border-border-strong bg-bg p-5">
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            {smolWeightBytes ? mb(smolWeightBytes) : "The weights"} of int8
            weights, fetched once and kept in the browser&rsquo;s cache. Nothing
            is downloaded until you press this, and nothing leaves your machine
            afterwards — the whole forward pass runs here.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadSmol}
              disabled={busy}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? "Loading…" : "Load the model"}
            </button>
            {progress && (
              <span className="font-mono text-2xs text-subtle">
                {progress.what === "parsing"
                  ? "parsing weights…"
                  : `${progress.what}${progress.cached ? " (cached)" : ""} · ${
                      progress.total
                        ? `${mb(progress.received)} / ${mb(progress.total)}`
                        : kb(progress.received)
                    }`}
              </span>
            )}
          </div>
          {progress && progress.total > 0 && (
            <div
              role="progressbar"
              aria-label="Downloading model weights"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress.received / progress.total) * 100)}
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${(progress.received / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      ) : null}

      {/* ---- prompt ------------------------------------------------------ */}
      <label htmlFor="nano-prompt" className="mt-5 block font-mono text-2xs tracking-wide text-subtle uppercase">
        {model === "smol" && mode === "chat" ? "Ask it something" : "Prompt"}
      </label>
      <textarea
        id="nano-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        disabled={busy || needsDownload}
        className="mt-2 w-full resize-y rounded border border-border-strong bg-bg p-3 font-mono text-sm text-text outline-none focus-visible:border-accent disabled:opacity-60"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrompt(p)}
            disabled={busy || needsDownload}
            className="rounded-sm bg-surface-2 px-2 py-1 text-left font-mono text-2xs text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy || needsDownload}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy && !needsDownload ? "Generating…" : "Generate"}
        </button>
        {busy && !needsDownload && (
          <button
            type="button"
            onClick={() => { stopRef.current = true; }}
            className="rounded border border-border-strong px-3 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Stop
          </button>
        )}
        {prefill && prefill.done < prefill.total && (
          <span className="font-mono text-2xs text-subtle">
            prefill {prefill.done}/{prefill.total} tokens
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded border border-border-strong bg-bg p-3 font-mono text-2xs leading-relaxed text-muted">
          {error}
        </p>
      )}

      {/* ---- output ------------------------------------------------------ */}
      <div
        aria-live="polite"
        aria-label="Generated text"
        className="mt-5 min-h-[9rem] rounded border border-border bg-bg p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-text"
      >
        {output ? (
          <>
            {/* In completion mode the model is continuing the prompt, so the
                prompt is part of the output — shown greyed so it stays
                obvious which half the engine produced. */}
            {model === "smol" && mode === "complete" && (
              <span className="text-subtle">{echoed ?? ""}</span>
            )}
            {output}
          </>
        ) : (
          <span className="text-subtle">
            Output appears here, streamed one token at a time.
          </span>
        )}
      </div>

      {stats && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {(
            [
              ["tok/s", (stats.tokens / Math.max(1e-3, stats.genMs / 1000)).toFixed(1)],
              ["ms/token", (stats.genMs / Math.max(1, stats.tokens)).toFixed(1)],
              stats.prefillMs > 0
                ? ["prefill", `${stats.prefillMs.toFixed(0)} ms · ${stats.promptTokens} tok`]
                : ["tokens", String(stats.tokens)],
              [
                "resident",
                stats.resident > 4 * 1048576 ? mb(stats.resident) : kb(stats.resident),
              ],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dd className="font-mono text-lg tabular-nums text-text">{v}</dd>
              <dt className="mt-0.5 font-mono text-2xs text-subtle">{k}</dt>
            </div>
          ))}
        </dl>
      )}

      {/* ---- the honest footnote ----------------------------------------- */}
      <p className="mt-4 text-xs leading-relaxed text-subtle">
        {model === "smol" ? (
          <>
            <strong className="font-medium text-muted">The weights are not mine</strong> —
            SmolLM2 was trained by Hugging Face, and this page would be lying if
            it implied otherwise. What is mine is everything between the file and
            the token: the format, the loader, RMSNorm, RoPE, grouped-query
            attention, SwiGLU, the KV cache, the int8 matmul and the sampler.
            {stats && stats.kv > 0 && (
              <>
                {" "}
                Of the {mb(stats.resident)} resident, {mb(stats.kv)} is the KV
                cache — it grows with every token and is the reason context
                windows cost memory rather than just time.
              </>
            )}
          </>
        ) : (
          <>
            <strong className="font-medium text-muted">int8 here is a wire saving, not a memory one:</strong>{" "}
            the small model dequantises to fp32 on load, so &ldquo;resident&rdquo;
            is identical either way. The larger model does keep its weights
            packed and multiplies them in place — that is what the int8 matmul
            kernel bought, and it is the difference between 129 MB and 513 MB in
            a tab.
          </>
        )}
      </p>
    </div>
  );
}

function ModelButton({
  selected, disabled, onSelect, title, detail, note,
}: {
  selected: boolean; disabled: boolean; onSelect: () => void;
  title: string; detail: string; note: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
      className={`rounded border p-3 text-left transition-colors disabled:opacity-50 ${
        selected
          ? "border-accent bg-bg"
          : "border-border bg-bg hover:border-border-strong"
      }`}
    >
      <span className={`block font-mono text-sm ${selected ? "text-accent" : "text-text"}`}>
        {title}
      </span>
      <span className="mt-1 block font-mono text-2xs text-muted">{detail}</span>
      <span className="mt-0.5 block font-mono text-2xs text-subtle">{note}</span>
    </button>
  );
}

function Segmented({
  label, options, value, disabled, onChange,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const id = `seg-${label.toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className="mr-3 font-mono text-2xs tracking-wide text-subtle uppercase">
        {label}
      </span>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          disabled={disabled}
          className={`ml-1 rounded border px-2.5 py-1 font-mono text-2xs uppercase transition-colors disabled:opacity-50 ${
            value === v
              ? "border-accent bg-accent text-accent-contrast"
              : "border-border text-muted hover:border-border-strong"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
