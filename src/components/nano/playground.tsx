"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NanoEngine, type Precision } from "./engine";
import { LlamaEngine, chatPrompt, type GenStats, type LoadProgress } from "./llama";
import { retrieve, groundedPrompt, usedCount, REFUSAL, type Grounding } from "./ground";
import { Recorder, Speaker, loadTranscriber, MAX_SECONDS } from "./voice";
import { askHosted, type HostedState } from "./hosted";
import { Assistant } from "./assistant";
import type { SphereMode } from "./sphere";

/**
 * The demo, for both models the engine can run.
 *
 * The point of the selector is the comparison, not the choice. One model is
 * 359K parameters trained here on 66 KB of prose and it produces mush; the
 * other is 135M parameters trained by somebody with a GPU cluster and it
 * answers questions. Same C++ forward pass, same WASM, same kernels, the
 * difference is entirely the weights, which is the thing a page like this
 * should demonstrate rather than assert.
 *
 * Nothing loads until asked: the WASM and both weight files sit behind this
 * component's dynamic import, and the 129 MB model needs an explicit click
 * with the cost shown next to it.
 */

export interface PlaygroundProps {
  /** Real byte count from disk, or null when the weights are served from
   *  another origin. Never a literal, see getSmolInfo(). */
  smolWeightBytes: number | null;
  smolParams: number | null;
  smolName: string | null;
  /** False when this deployment has no weights to serve and none configured
   *  elsewhere. The demo then offers only the small model and says why, rather
   *  than showing a Load button that 404s, the same rule the semantic search
   *  stage follows when its model is absent. */
  smolAvailable: boolean;
}

type ModelId = "smol" | "nano" | "kimi";
type Mode = "grounded" | "chat" | "complete";

const GROUNDED_PROMPTS = [
  "What is tadiwa-nano?",
  "How does the search index work?",
  "What was the hardest part of the K20 project?",
  "What is the capital of France?",
];

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
  const recorderRef = useRef<Recorder | null>(null);
  const tickRef = useRef<number | null>(null);

  const [model, setModel] = useState<ModelId>(smolAvailable ? "smol" : "nano");
  const [mode, setMode] = useState<Mode>("grounded");
  const [precision, setPrecision] = useState<Precision>("int8");

  const [groundedText, setGroundedText] = useState(GROUNDED_PROMPTS[0]);
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
  /** Short-lived note for a step that is neither download nor generation,
   *  retrieval, mostly, which is fast but not instant on a cold index. */
  const [status, setStatus] = useState<string | null>(null);
  const [smolReady, setSmolReady] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState<number | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  /** The hosted comparison. Never runs unless asked for; it costs money and
   *  leaves the machine, which is the opposite of everything else here. */
  const [hosted, setHosted] = useState<HostedState>({ status: "idle" });
  /** The live mic spectrum, lifted into state so the visualiser re-binds when
   *  a recording starts and unbinds when it ends. */
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  /** One Speaker for the component's life. State rather than a ref because the
   *  visualiser needs it during render, and refs may not be read there. The
   *  lazy initialiser is what keeps it to a single construction. */
  const [speaker] = useState<Speaker | null>(() =>
    typeof window !== "undefined" && Speaker.supported() ? new Speaker(false) : null,
  );
  /** Driven by the synthesiser's own end event. Polling `speaker.busy` during
   *  render would read a value that changes without re-rendering. */
  const [isSpeaking, setIsSpeaking] = useState(false);
  /** The passages the model was actually shown, listed under the answer so a
   *  visitor can check the answer against its evidence rather than trust it. */
  const [grounding, setGrounding] = useState<Grounding | null>(null);
  const [stats, setStats] = useState<
    (GenStats & { resident: number; kv: number }) | null
  >(null);
  /** Separate from `stats` because none of tok/s, prefill or resident bytes
   *  mean anything for a model running somewhere else. Latency and the
   *  server's source count are the only honest numbers here. */
  /**
   * Whether the hosted comparison is switched on, asked of the route rather
   * than passed down.
   *
   * This page is statically rendered, so a prop would carry whatever was true
   * when `next build` ran, and OPENROUTER_API_KEY is set at RUNTIME. The route
   * holds the key, so the route answers. "checking" is a real state and is
   * shown as one: pretending it is off until proven otherwise would put a
   * wrong label on the button for as long as the request takes.
   */
  const [kimi, setKimi] = useState<
    { status: "checking" } | { status: "on"; name: string } | { status: "off" }
  >({ status: "checking" });

  useEffect(() => {
    let live = true;
    fetch("/api/compare")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { available?: boolean; model?: string | null }) => {
        if (!live) return;
        setKimi(
          d.available
            ? { status: "on", name: (d.model ?? "kimi-k3").split("/").pop()! }
            : { status: "off" },
        );
      })
      // A failed probe means the endpoint is not answering, which is
      // indistinguishable from it being off as far as this button goes.
      .catch(() => live && setKimi({ status: "off" }));
    return () => {
      live = false;
    };
  }, []);

  const [kimiMeta, setKimiMeta] = useState<
    { ms: number; sources: number | null; model: string | null; refused: boolean } | null
  >(null);

  const byMode = <T,>(grounded: T, chat: T, complete: T, nano: T): T =>
    model === "nano"
      ? nano
      // Kimi shares the grounded box on purpose: the comparison is only worth
      // anything if both models get the same question typed once.
      : model === "kimi" || mode === "grounded"
        ? grounded
        : mode === "chat"
          ? chat
          : complete;

  const prompt = byMode(groundedText, chatText, completeText, nanoText);
  const setPrompt = byMode(setGroundedText, setChatText, setCompleteText, setNanoText);
  const suggestions = byMode(GROUNDED_PROMPTS, CHAT_PROMPTS, COMPLETE_PROMPTS, NANO_PROMPTS);

  useEffect(() => speaker?.addDoneListener(() => setIsSpeaking(false)), [speaker]);

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

  /**
   * Stops recording, transcribes locally, and puts the text in the box.
   *
   * Deliberately does NOT auto-submit. A wrong transcription that silently
   * becomes a question produces an answer to something nobody asked, and the
   * visitor has no way to tell that is what happened, so the transcript lands
   * in the textarea where it can be read and corrected first.
   */
  const stopMic = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec?.recording) return;
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setListening(null);
    setAnalyser(null);
    try {
      const { audio, seconds } = await rec.stop();
      if (seconds < 0.4) {
        setVoiceNote("too short, hold the button while you speak");
        return;
      }
      const transcribe = await loadTranscriber((n) => setVoiceNote(`loading ${n}`));
      setVoiceNote("transcribing…");
      const text = await transcribe(audio);
      if (!text) {
        setVoiceNote("nothing recognised, try again");
        return;
      }
      setPrompt(text);
      setVoiceNote(null);
    } catch (err) {
      setVoiceNote(err instanceof Error ? err.message : String(err));
    }
  }, [setPrompt]);

  const startMic = useCallback(async () => {
    const rec = (recorderRef.current ??= new Recorder());
    if (rec.recording) return;
    try {
      setVoiceNote(null);
      await rec.start();
      setAnalyser(rec.analyser);
      setListening(0);
      tickRef.current = window.setInterval(() => {
        setListening((n) => {
          const next = (n ?? 0) + 1;
          // Whisper-tiny works on 30-second windows and drops the tail past
          // that without complaining, so stop before it can.
          if (next >= MAX_SECONDS) void stopMic();
          return next;
        });
      }, 1000);
    } catch (err) {
      setVoiceNote(
        err instanceof Error && err.name === "NotAllowedError"
          ? "microphone permission denied, the browser blocked it, not the page"
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  }, [stopMic]);

  const toggleMic = useCallback(() => {
    return recorderRef.current?.recording ? stopMic() : startMic();
  }, [startMic, stopMic]);

  const run = useCallback(async () => {
    setBusy(true);
    setOutput("");
    setStats(null);
    setError(null);
    setPrefill(null);
    setStatus(null);
    setEchoed(model === "smol" && mode === "complete" ? prompt : null);
    setGrounding(null);
    setHosted({ status: "idle" });
    setKimiMeta(null);
    stopRef.current = false;

    speaker?.setEnabled(speak);
    speaker?.cancel();
    const say = (text: string) => {
      if (!speak || !speaker) return;
      setIsSpeaking(true);
      speaker.push(text);
    };
    try {
      // The hosted model. No engine, no weights, no download gate: the only
      // thing that happens locally is the fetch. The server does its own
      // retrieval, so there is no grounding to display from here and the
      // source count comes back in a header rather than being recomputed.
      if (model === "kimi") {
        setStatus("asking the datacentre\u2026");
        const r = await askHosted(prompt, (chunk) => {
          setOutput((prev) => prev + chunk);
          say(chunk);
        });
        speaker?.flush();
        setKimiMeta({ ms: r.ms, sources: r.sources, model: r.model, refused: r.refused });
        return;
      }

      if (model === "nano") {
        const engine = (nanoRef.current ??= new NanoEngine());
        if (engine.precision !== precision) await engine.load(precision);
        const { tokens, ms } = await engine.generate(
          prompt, 260, 0.85, 0.95, 1234,
          (text) => {
            setOutput((prev) => prev + text);
            say(text);
          },
          () => stopRef.current,
        );
        speaker?.flush();
        setStats({
          promptTokens: 0, tokens, prefillMs: 0, genMs: ms, stopped: "limit",
          resident: engine.info?.weightBytes ?? 0, kv: 0,
        });
        return;
      }

      const engine = llamaRef.current;
      if (!engine?.loaded) throw new Error("model not loaded");

      let built = prompt;
      if (mode === "grounded") {
        setStatus("retrieving…");
        const g = await retrieve(prompt);
        setGrounding(g);
        setStatus(null);
        // Nothing in the corpus matched, so there is nothing to answer FROM.
        // Refusing here rather than prompting the model is not a shortcut: it
        // is the only way to be certain the refusal happens, and it costs a
        // forward pass to be less certain.
        if (g.empty) {
          setOutput(REFUSAL);
          say(REFUSAL);
          speaker?.flush();
          setStats(null);
          return;
        }
        built = groundedPrompt(prompt, g.passages);
      } else {
        setGrounding(null);
        built = mode === "chat" ? chatPrompt(prompt) : prompt;
      }

      const s = await engine.generate(
        built,
        {
          maxTokens: 220,
          // Greedy whenever the model is answering rather than continuing: a
          // 135M model given temperature confabulates more, not less, and the
          // interesting failure here is the model's, not the sampler's.
          temperature: mode === "complete" ? 0.8 : 0.0,
          topP: 0.9,
          repeatPenalty: 1.12,
          seed: 1234,
          stopAtEos: mode !== "complete",
        },
        (done, total) => setPrefill({ done, total }),
        (text) => {
          setOutput((prev) => prev + text);
          say(text);
        },
        () => stopRef.current,
      );
      speaker?.flush();
      setStats({ ...s, resident: engine.info?.residentBytes ?? 0, kv: engine.info?.kvBytes ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrefill(null);
      setStatus(null);
      setBusy(false);
    }
  }, [model, mode, precision, prompt, speak, speaker]);

  /**
   * Asks the hosted model the same question, on demand.
   *
   * Per question rather than per session: this is the only thing on the page
   * that leaves the machine and the only thing that costs money, so a visitor
   * who never presses it never sends anything and never spends anything.
   */
  const compare = useCallback(async () => {
    setHosted({ status: "streaming", text: "" });
    try {
      const result = await askHosted(prompt, (chunk) =>
        setHosted((prev) =>
          prev.status === "streaming" ? { ...prev, text: prev.text + chunk } : prev,
        ),
      );
      setHosted({ status: "done", ...result });
    } catch (err) {
      const unavailable =
        typeof err === "object" && err !== null && "unavailable" in err && err.unavailable;
      const message = err instanceof Error ? err.message : String(err);
      setHosted(
        unavailable
          ? { status: "unavailable", detail: message }
          : { status: "error", message },
      );
    }
  }, [prompt]);

  const needsDownload = model === "smol" && !smolReady;

  /** Derived, not stored. A second source of truth for "what is happening"
   *  is a second thing that can disagree with the first. */
  const sphereMode: SphereMode =
    listening !== null
      ? "listening"
      : busy || voiceNote === "transcribing…"
        ? "thinking"
        : speak && isSpeaking
          ? "speaking"
          : "idle";

  // Feature detection, not user-agent sniffing. getUserMedia is absent on
  // insecure origins and in some embedded webviews; speechSynthesis is absent
  // in a few. Each control simply does not render where it cannot work.
  const voiceSupported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const speakSupported = Speaker.supported();

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {/* ---- the assistant ----------------------------------------------- */}
      <Assistant
        mode={sphereMode}
        analyser={analyser}
        speaker={speaker}
        speaking={speak}
        onToggleSpeak={() =>
          setSpeak((on) => {
            if (on) speaker?.cancel();
            speaker?.setEnabled(!on);
            return !on;
          })
        }
      />

      {/* ---- model ------------------------------------------------------- */}
      <div role="group" aria-labelledby="model-label">
        <span id="model-label" className="mb-2 block font-mono text-2xs tracking-wide text-subtle uppercase">
          Model
        </span>
        <div className="grid gap-2 sm:grid-cols-3">
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
          <ModelButton
            selected={model === "kimi"}
            disabled={busy || kimi.status !== "on"}
            onSelect={() => setModel("kimi")}
            title={kimi.status === "on" ? kimi.name : "kimi-k3"}
            detail="2.8T params · not in this tab"
            note={
              kimi.status === "checking"
                ? "checking availability\u2026"
                : kimi.status === "on"
                  ? "hosted · the one thing here that leaves your machine"
                  : "no API key on this deployment"
            }
          />
        </div>
      </div>

      {/* ---- mode / precision -------------------------------------------- */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        {model === "kimi" ? (
          // Not a Segmented with one option: there is no choice to offer. The
          // route grounds every request and ignores anything else, so a
          // control implying otherwise would be lying about what runs.
          <div role="group" aria-labelledby="kimi-fixed">
            <span
              id="kimi-fixed"
              className="mr-3 font-mono text-2xs tracking-wide text-subtle uppercase"
            >
              Prompting
            </span>
            <span className="rounded border border-accent bg-accent px-2.5 py-1 font-mono text-2xs uppercase text-accent-contrast">
              Grounded
            </span>
          </div>
        ) : model === "smol" ? (
          <Segmented
            label="Prompting"
            options={[
              ["grounded", "Grounded"],
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
            : model === "kimi"
              ? "Grounded always, and the retrieval runs on the server. The browser sends the question and nothing else, so this cannot be used to relay arbitrary text to a paid API."
            : mode === "grounded"
              ? "The BM25 index behind ⌘K retrieves the passages first; the model answers only from those, and they are listed underneath."
              : mode === "chat"
                ? "Asked cold, with no sources. This is the control, try the same question in both and watch it invent an answer here."
                : "Fed in verbatim. No template, no stop token, it just continues the text."}
        </p>
      </div>

      {/* ---- the download gate ------------------------------------------- */}
      {needsDownload ? (
        <div className="mt-5 rounded border border-dashed border-border-strong bg-bg p-5">
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            {smolWeightBytes ? mb(smolWeightBytes) : "The weights"} of int8
            weights, fetched once and kept in the browser&rsquo;s cache. Nothing
            is downloaded until you press this, and nothing leaves your machine
            afterwards, the whole forward pass runs here.
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
          disabled={busy || needsDownload || listening !== null}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy && !needsDownload ? "Generating…" : "Ask"}
        </button>

        {/* ---- voice in ------------------------------------------------ */}
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={busy || needsDownload}
            aria-pressed={listening !== null}
            aria-label={listening !== null ? "Stop recording" : "Ask by voice"}
            className={`flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
              listening !== null
                ? "border-accent bg-accent text-accent-contrast"
                : "border-border-strong text-muted hover:text-text"
            }`}
          >
            <span aria-hidden="true" className={listening !== null ? "animate-pulse" : ""}>
              ●
            </span>
            {listening !== null ? `${MAX_SECONDS - listening}s` : "Speak"}
          </button>
        )}

        {/* ---- voice out ----------------------------------------------- */}
        {speakSupported && (
          <button
            type="button"
            onClick={() => {
              setSpeak((on) => {
                if (on) speaker?.cancel();
                return !on;
              });
            }}
            aria-pressed={speak}
            className={`rounded border px-3 py-2 font-mono text-2xs uppercase transition-colors ${
              speak
                ? "border-accent text-accent"
                : "border-border text-subtle hover:text-muted"
            }`}
          >
            {speak ? "Speaking on" : "Speak replies"}
          </button>
        )}
        {busy && !needsDownload && (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
              speaker?.cancel();
            }}
            className="rounded border border-border-strong px-3 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Stop
          </button>
        )}
        {status && <span className="font-mono text-2xs text-subtle">{status}</span>}
        {voiceNote && <span className="font-mono text-2xs text-subtle">{voiceNote}</span>}
        {listening !== null && (
          <span className="font-mono text-2xs text-accent">
            listening, press again when you&rsquo;re done
          </span>
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
                prompt is part of the output, shown greyed so it stays
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

      {/* ---- what it was allowed to read -------------------------------- */}
      {grounding && !grounding.empty && (
        <details className="mt-3 rounded border border-border bg-bg p-3" open>
          <summary className="cursor-pointer font-mono text-2xs tracking-wide text-subtle uppercase">
            {usedCount(grounding.passages)} source
            {usedCount(grounding.passages) === 1 ? "" : "s"} the model was shown ·{" "}
            {grounding.stage}
          </summary>
          <ol className="mt-3 space-y-2">
            {grounding.passages.slice(0, usedCount(grounding.passages)).map((hit, i) => (
              <li key={hit.chunk.id} className="text-xs leading-relaxed">
                <span className="font-mono text-2xs text-subtle">[{i + 1}]</span>{" "}
                <a
                  href={hit.chunk.url}
                  className="text-accent underline decoration-dotted underline-offset-2"
                >
                  {hit.chunk.title}, {hit.chunk.section}
                </a>
                <p className="mt-0.5 text-muted">{hit.chunk.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-2xs leading-relaxed text-subtle">
            Every claim in the answer above should be checkable against these.
            If one isn&rsquo;t, the model made it up, which is the failure this
            mode exists to make visible rather than to hide.
          </p>
        </details>
      )}

      {grounding?.empty && (
        <p className="mt-3 rounded border border-dashed border-border-strong bg-bg p-3 text-xs leading-relaxed text-muted">
          Nothing in the corpus matched that question, so the model was never
          asked. The refusal above is the retrieval stage&rsquo;s, not the
          model&rsquo;s, which is the only way to be sure it happens.
        </p>
      )}

      {/* ---- the hosted comparison -------------------------------------- */}
      {model === "smol" && mode === "grounded" && output && !busy && (
        <div className="mt-3 rounded border border-border bg-bg p-3">
          {hosted.status === "idle" ? (
            <>
              <button
                type="button"
                onClick={compare}
                className="rounded border border-border-strong px-3 py-1.5 font-mono text-2xs uppercase text-muted transition-colors hover:text-text"
              >
                Ask Kimi K3 the same question →
              </button>
              <p className="mt-2 text-2xs leading-relaxed text-subtle">
                2.8 trillion parameters, in a datacentre. It cannot run here,
                even at four bits that is about a terabyte of weights, and
                mixture-of-experts needs every expert resident regardless of
                which ones a token uses. This is the one control on the page
                that sends anything anywhere.
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-2xs tracking-wide text-subtle uppercase">
                {hosted.status === "streaming"
                  ? "Kimi K3 · streaming…"
                  : hosted.status === "done"
                    ? `${hosted.model ?? "hosted"} · ${(hosted.ms / 1000).toFixed(1)}s · same sources`
                    : "Kimi K3"}
              </p>
              <div className="mt-2 font-mono text-sm leading-relaxed whitespace-pre-wrap text-text">
                {hosted.status === "streaming" || hosted.status === "done" ? (
                  hosted.text
                ) : hosted.status === "unavailable" ? (
                  <span className="text-subtle">{hosted.detail}</span>
                ) : (
                  <span className="text-subtle">{hosted.message}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* The hosted model gets its own readout. tok/s, prefill and resident
          bytes are all measurements of THIS machine doing the work, and it
          did not: printing them would be inventing numbers. */}
      {model === "kimi" && kimiMeta && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {(
            [
              ["round trip", `${(kimiMeta.ms / 1000).toFixed(1)} s`],
              ["sources", kimiMeta.sources === null ? "n/a" : String(kimiMeta.sources)],
              ["resident here", "0 B"],
              ["ran on", "someone else\u2019s GPUs"],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dd className="font-mono text-lg tabular-nums text-text">{v}</dd>
              <dt className="mt-0.5 font-mono text-2xs text-subtle">{k}</dt>
            </div>
          ))}
        </dl>
      )}

      {model === "kimi" && kimiMeta?.refused && (
        <p className="mt-3 rounded border border-dashed border-border-strong bg-bg p-3 text-xs leading-relaxed text-muted">
          Nothing in the corpus matched, so the server refused before calling
          the API. That refusal cost nothing and is the same one the local
          model gives: the guard sits in the retrieval stage, not in whichever
          model runs behind it.
        </p>
      )}

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
        {model === "kimi" ? (
          <>
            <strong className="font-medium text-muted">
              This one is not running here.
            </strong>{" "}
            Kimi K3 is roughly a terabyte of weights even at four bits, and a
            mixture-of-experts model needs every expert resident whichever ones
            a token actually uses, so it is four orders of magnitude past what a
            tab can hold. It gets the same question, the same retrieved
            passages and the same system prompt as the 135M model above, so what
            differs between the two answers is the model rather than the
            plumbing. Everything else on this page runs on your machine; this
            is the exception, and it is opt-in for that reason.
          </>
        ) : model === "smol" ? (
          <>
            <strong className="font-medium text-muted">The weights are not mine</strong>,
            SmolLM2 was trained by Hugging Face, and this page would be lying if
            it implied otherwise. What is mine is everything between the file and
            the token: the format, the loader, RMSNorm, RoPE, grouped-query
            attention, SwiGLU, the KV cache, the int8 matmul and the sampler.
            {stats && stats.kv > 0 && (
              <>
                {" "}
                Of the {mb(stats.resident)} resident, {mb(stats.kv)} is the KV
                cache, it grows with every token and is the reason context
                windows cost memory rather than just time.
              </>
            )}
          </>
        ) : (
          <>
            <strong className="font-medium text-muted">int8 here is a wire saving, not a memory one:</strong>{" "}
            the small model dequantises to fp32 on load, so &ldquo;resident&rdquo;
            is identical either way. The larger model does keep its weights
            packed and multiplies them in place, that is what the int8 matmul
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
