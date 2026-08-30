/**
 * The voice half of the assistant. Both directions run on this machine.
 *
 * Speech recognition is Whisper-tiny.en through ONNX Runtime Web, fetched
 * same-origin like every other model here. The browser's own
 * `SpeechRecognition` would have been one line and no download — and in Chrome
 * it uploads the audio to Google to transcribe. A site whose entire argument is
 * "no server does the interesting part" cannot put its microphone on somebody
 * else's server and keep saying that, so it pays 42 MB instead.
 *
 * Speech synthesis is the platform's own `speechSynthesis`, which is local,
 * free, and already installed. There is no equivalent objection: it sends
 * nothing anywhere.
 */

export type VoiceState =
  | { status: "idle" }
  | { status: "loading"; note: string }
  | { status: "ready" }
  | { status: "listening"; seconds: number }
  | { status: "transcribing" }
  | { status: "error"; message: string };

/** Whisper is trained on 16 kHz mono. Anything else has to be resampled, and
 *  feeding it 48 kHz silently produces confident nonsense at the wrong speed. */
const SAMPLE_RATE = 16000;

/** Hard ceiling on one utterance. Whisper-tiny processes 30-second windows;
 *  past that the tail is dropped without any error, so the recorder stops
 *  first and says so. */
export const MAX_SECONDS = 20;

type Transcriber = (audio: Float32Array) => Promise<string>;

let asrPromise: Promise<Transcriber> | null = null;

/**
 * Loads Whisper. ~42 MB, so only ever from an explicit click.
 *
 * The two `env` flags are both required and are the same trap the search
 * embedder hit: in the browser build `allowLocalModels` defaults to FALSE, so
 * setting only `allowRemoteModels = false` disables every source and
 * transformers.js refuses to start.
 */
export async function loadTranscriber(
  onNote: (note: string) => void,
): Promise<Transcriber> {
  if (!asrPromise) {
    asrPromise = (async () => {
      onNote("speech model (~42 MB)");
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = "/models/";

      const asr = await pipeline(
        "automatic-speech-recognition",
        "whisper-tiny.en",
        {
          dtype: "q8",
          // REQUIRED, and not an optimisation setting.
          //
          // ONNX Runtime Web's QDQ graph optimiser cannot handle whisper's
          // merged decoder and throws on session creation:
          //
          //   qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits
          //   Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale
          //
          // Measured, not guessed: it fails on onnx-community AND Xenova
          // whisper-tiny.en, at q8, int8, uint8, q4 and fp32 alike, and on
          // moonshine-tiny too — while MiniLM loads fine through the same
          // runtime. The weights are not the problem, the optimiser pass is,
          // and turning it off is what makes the session build.
          //
          // The same q8 files load without this in onnxruntime-NODE, which is
          // why the Node smoke test in scripts/fetch-voice-model.ts passes and
          // proves nothing about the browser. Only a real browser can check
          // this, which is what scripts/cdp.mjs is for.
          session_options: { graphOptimizationLevel: "disabled" },
        } as never,
      );
      return async (audio: Float32Array) => {
        const out = (await asr(audio)) as { text?: string } | { text?: string }[];
        const text = Array.isArray(out) ? out[0]?.text : out.text;
        return (text ?? "").trim();
      };
    })().catch((err) => {
      // Do not cache a failed load. A blocked fetch or a deployment without
      // the model would otherwise poison every retry for the session.
      asrPromise = null;
      throw err;
    });
  }
  return asrPromise;
}

/** True when this deployment actually serves the speech model. Checked before
 *  offering the button, so a missing model is a disabled control rather than a
 *  42 MB request that 404s halfway. */
export async function voiceAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/models/whisper-tiny.en/config.json", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export interface Recording {
  audio: Float32Array;
  seconds: number;
}

/**
 * Records from the microphone until stopped, and returns 16 kHz mono floats.
 *
 * MediaRecorder gives compressed blobs in a codec that varies by browser, so
 * the audio is decoded through an AudioContext and resampled by an
 * OfflineAudioContext rather than trusted to arrive in the right shape.
 */
export class Recorder {
  private media: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  /** Prompts for microphone permission and begins capture. */
  async start(): Promise<void> {
    this.media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.media);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.startedAt = performance.now();
  }

  /** Stops capture, releases the microphone, and decodes what was captured. */
  async stop(): Promise<Recording> {
    const rec = this.recorder;
    if (!rec) throw new Error("not recording");

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType }));
      rec.stop();
    });

    // Release the microphone immediately. A live track keeps the browser's
    // recording indicator on, which is alarming and correct to avoid.
    this.media?.getTracks().forEach((t) => t.stop());
    this.media = null;
    this.recorder = null;

    const seconds = (performance.now() - this.startedAt) / 1000;
    return { audio: await toMono16k(await blob.arrayBuffer()), seconds };
  }

  /** Abandons the recording without decoding it. */
  cancel(): void {
    try {
      this.recorder?.stop();
    } catch {
      /* already stopped */
    }
    this.media?.getTracks().forEach((t) => t.stop());
    this.media = null;
    this.recorder = null;
    this.chunks = [];
  }
}

async function toMono16k(encoded: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(encoded);
    if (decoded.sampleRate === SAMPLE_RATE && decoded.numberOfChannels === 1) {
      return decoded.getChannelData(0).slice();
    }
    const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
    const off = new OfflineAudioContext(1, Math.max(1, frames), SAMPLE_RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0).slice();
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
//  Speaking
// ---------------------------------------------------------------------------

/**
 * Speaks text, one sentence at a time as it arrives.
 *
 * Queuing whole sentences rather than every streamed fragment is what makes it
 * sound like speech instead of a stutter: `speechSynthesis` restarts its
 * prosody on every utterance, so feeding it four-token chunks produces a
 * robot reading a word list.
 */
export class Speaker {
  private buffer = "";
  private enabled = true;
  private voice: SpeechSynthesisVoice | null = null;

  static supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  constructor(enabled = true) {
    this.enabled = enabled;
    if (Speaker.supported()) this.pickVoice();
  }

  /** Prefers a local, English voice. `getVoices()` is empty until the engine
   *  populates it, so this is also called from the `voiceschanged` event. */
  private pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      window.speechSynthesis.addEventListener("voiceschanged", this.pickVoice, { once: true });
      return;
    }
    this.voice =
      voices.find((v) => v.lang.startsWith("en") && v.localService) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0];
  };

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.cancel();
  }

  /** Feeds streamed text in. Complete sentences are spoken; a partial tail is
   *  held until it finishes. */
  push(text: string) {
    if (!this.enabled || !Speaker.supported()) return;
    this.buffer += text;
    // Split after . ! ? followed by whitespace — the same boundary the
    // training-data extractor uses, for the same reason.
    const parts = this.buffer.split(/(?<=[.!?])\s+/);
    this.buffer = parts.pop() ?? "";
    for (const s of parts) this.utter(s);
  }

  /** Speaks whatever is left, at the end of a completion. */
  flush() {
    if (this.buffer.trim()) this.utter(this.buffer);
    this.buffer = "";
  }

  private utter(text: string) {
    const t = text.trim();
    if (!t) return;
    const u = new SpeechSynthesisUtterance(t);
    if (this.voice) u.voice = this.voice;
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }

  cancel() {
    this.buffer = "";
    if (Speaker.supported()) window.speechSynthesis.cancel();
  }
}
