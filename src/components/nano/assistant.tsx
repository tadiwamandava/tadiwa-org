"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sphere, type SphereMode } from "./sphere";
import { Speaker, type VoiceChoice } from "./voice";

/**
 * The visualiser and its controls.
 *
 * The canvas is `aria-hidden` and every state it depicts is also written in
 * text underneath. That is the same rule the circuit-board hero follows: a
 * canvas is invisible to a screen reader, so it may enhance the page and may
 * never be the only place information lives.
 */

export interface AssistantProps {
  mode: SphereMode;
  /** Live microphone spectrum while listening, or null. */
  analyser: AnalyserNode | null;
  speaker: Speaker | null;
  /** Voice output is on. */
  speaking: boolean;
  onToggleSpeak: () => void;
}

const LABEL: Record<SphereMode, string> = {
  idle: "Standing by",
  listening: "Listening",
  thinking: "Working",
  speaking: "Speaking",
};

export function Assistant({
  mode, analyser, speaker, speaking, onToggleSpeak,
}: AssistantProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sphereRef = useRef<Sphere | null>(null);
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const [current, setCurrent] = useState<VoiceChoice | null>(null);

  // The renderer owns a rAF loop and a canvas, so it is created once and torn
  // down on unmount rather than rebuilt per render.
  useEffect(() => {
    if (!canvasRef.current) return;
    const s = new Sphere(canvasRef.current);
    sphereRef.current = s;
    s.start();
    const onResize = () => s.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      s.stop();
      sphereRef.current = null;
    };
  }, []);

  useEffect(() => {
    sphereRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    sphereRef.current?.attachAnalyser(analyser);
  }, [analyser]);

  // Word boundaries are the only real signal about synthesised speech, since
  // its audio never enters the WebAudio graph.
  useEffect(
    () => speaker?.addWordListener(() => sphereRef.current?.pulse(0.9)),
    [speaker],
  );

  // getVoices() is asynchronously populated, so read it once the engine says so.
  useEffect(() => {
    if (!Speaker.supported()) return;
    const read = () => {
      setVoices(Speaker.voices());
      setCurrent(speaker?.current() ?? null);
    };
    read();
    window.speechSynthesis.addEventListener("voiceschanged", read);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", read);
  }, [speaker]);

  const chooseVoice = useCallback(
    (name: string) => {
      speaker?.use(name || null);
      setCurrent(speaker?.current() ?? null);
    },
    [speaker],
  );

  return (
    <div className="rounded-lg border border-border bg-bg p-5">
      <div className="relative mx-auto aspect-square w-full max-w-sm">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="h-full w-full"
        />
      </div>

      {/* The state the canvas is drawing, in text, for everyone who cannot
          see it, and as the live region that announces changes. */}
      <p
        aria-live="polite"
        className="mt-2 text-center text-2xs tracking-[0.2em] text-[#ffb020] uppercase"
      >
        {LABEL[mode]}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggleSpeak}
          aria-pressed={speaking}
          className={`rounded border px-3 py-1.5 text-2xs uppercase transition-colors ${
            speaking
              ? "border-[#ffb020] text-[#ffb020]"
              : "border-white/20 text-white/50 hover:text-white/80"
          }`}
        >
          {speaking ? "Voice on" : "Voice off"}
        </button>

        {voices.length > 0 && (
          <label className="flex items-center gap-2 font-mono text-2xs text-white/50">
            <span className="sr-only">Assistant voice</span>
            <select
              value={current?.name ?? ""}
              onChange={(e) => chooseVoice(e.target.value)}
              className="max-w-[16rem] rounded border border-white/20 bg-transparent px-2 py-1 text-white/70 outline-none focus-visible:border-[#ffb020]"
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name} className="bg-bg">
                  {v.preferred ? "preferred · " : ""}
                  {v.name} · {v.lang}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <p className="mt-3 text-center text-2xs leading-relaxed text-white/35">
        {current?.preferred ? (
          <>
            Speaking with <span className="text-white/60">{current.name}</span> (
            {current.lang}), an African English voice installed on your device.
          </>
        ) : current ? (
          <>
            Your device has no African English voice installed, so this falls back
            to <span className="text-white/60">{current.name}</span> ({current.lang}).
            The voice list belongs to your operating system; a web page can choose
            from it but cannot add to it.
          </>
        ) : (
          <>Speech synthesis is unavailable in this browser.</>
        )}
      </p>
    </div>
  );
}
