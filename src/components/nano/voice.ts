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
  private live: AudioContext | null = null;
  /** Live spectrum of the microphone while recording, for the visualiser.
   *  Separate from the recorded blob: this is analysed in real time and
   *  thrown away, the blob is what Whisper eventually sees. */
  analyser: AnalyserNode | null = null;

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

    // Tap the same stream for the visualiser. fftSize 512 gives 256 bins at
    // ~90 Hz resolution, which is enough to separate a vowel from a fricative
    // and cheap enough to run every frame.
    try {
      this.live = new AudioContext();
      const src = this.live.createMediaStreamSource(this.media);
      this.analyser = this.live.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.7;
      src.connect(this.analyser);
      // Deliberately NOT connected to destination — routing the mic to the
      // speakers is a feedback loop, and the analyser pulls frames on its own.
    } catch {
      this.analyser = null;   // visualiser falls back to its idle animation
    }
  }

  private async closeLive() {
    this.analyser = null;
    const ctx = this.live;
    this.live = null;
    if (ctx) await ctx.close().catch(() => {});
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
    await this.closeLive();

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
    void this.closeLive();
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
/**
 * Locale preference, best first.
 *
 * The available voices belong to the operating system, not to this page — a
 * site cannot install one. So the honest thing is to prefer an African English
 * voice where the device has one and to say which voice is actually being used
 * rather than implying a choice that was not available.
 *
 * On the machine this was written on, 199 voices are installed and exactly one
 * is African English: Tessa (en-ZA). Many devices will have none, which is why
 * the chain falls through to en-GB rather than to nothing.
 */
const VOICE_PREFERENCE = ["en-ZA", "en-NG", "en-KE", "en-GH", "en-TZ", "en-GB", "en"];

export interface VoiceChoice {
  name: string;
  lang: string;
  /** True when this is an African English locale rather than a fallback. */
  preferred: boolean;
}

export class Speaker {
  private buffer = "";
  private enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  private forced: string | null = null;
  /** Listener sets rather than single slots.
   *
   *  Two components want word events — the visualiser to pulse, the panel to
   *  track speaking state — and a single assignable property means whichever
   *  mounts second silently wins. Subscription also keeps callers from
   *  mutating a shared object they were merely handed. */
  private wordListeners = new Set<() => void>();
  private doneListeners = new Set<() => void>();
  private speaking = 0;

  /** Fires on each spoken word. TTS audio never reaches the WebAudio graph,
   *  so this is the only real signal about what the synthesiser is doing.
   *  Returns an unsubscribe. */
  addWordListener(fn: () => void): () => void {
    this.wordListeners.add(fn);
    return () => this.wordListeners.delete(fn);
  }

  /** Fires when the queue drains. Returns an unsubscribe. */
  addDoneListener(fn: () => void): () => void {
    this.doneListeners.add(fn);
    return () => this.doneListeners.delete(fn);
  }

  static supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  constructor(enabled = true) {
    this.enabled = enabled;
    if (Speaker.supported()) this.pickVoice();
  }

  /** Walks VOICE_PREFERENCE, preferring a locally-installed voice at each step.
   *  `getVoices()` is empty until the engine populates it, hence the event. */
  private pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      window.speechSynthesis.addEventListener("voiceschanged", this.pickVoice, { once: true });
      return;
    }
    if (this.forced) {
      this.voice = voices.find((v) => v.name === this.forced) ?? this.voice;
      return;
    }
    for (const tag of VOICE_PREFERENCE) {
      const match =
        voices.find((v) => v.lang.replace("_", "-").startsWith(tag) && v.localService) ??
        voices.find((v) => v.lang.replace("_", "-").startsWith(tag));
      if (match) {
        this.voice = match;
        return;
      }
    }
    this.voice = voices[0] ?? null;
  };

  /** Every English voice the device has, best-preferred first, for a picker. */
  static voices(): VoiceChoice[] {
    if (!Speaker.supported()) return [];
    return window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith("en"))
      .map((v) => ({
        name: v.name,
        lang: v.lang,
        preferred: /^en[-_](ZA|NG|KE|GH|TZ)/i.test(v.lang),
      }))
      .sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name));
  }

  /** The voice actually in use, so the UI can name it instead of guessing. */
  current(): VoiceChoice | null {
    if (!this.voice) return null;
    return {
      name: this.voice.name,
      lang: this.voice.lang,
      preferred: /^en[-_](ZA|NG|KE|GH|TZ)/i.test(this.voice.lang),
    };
  }

  use(name: string | null) {
    this.forced = name;
    this.pickVoice();
  }

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
    // Measured rather than brisk. The recognisable quality of the delivery the
    // visitor is picturing is its unhurriedness far more than its phonetics,
    // and pace is the one parameter a web page actually controls.
    u.rate = 0.92;
    u.pitch = 0.9;
    u.onboundary = (e) => {
      if (e.name === "word" || e.charIndex !== undefined) {
        this.wordListeners.forEach((fn) => fn());
      }
    };
    this.speaking++;
    const settle = () => {
      this.speaking = Math.max(0, this.speaking - 1);
      if (this.speaking === 0) this.doneListeners.forEach((fn) => fn());
    };
    u.onend = settle;
    u.onerror = settle;
    window.speechSynthesis.speak(u);
  }

  get busy(): boolean {
    return this.speaking > 0;
  }

  cancel() {
    this.buffer = "";
    this.speaking = 0;
    if (Speaker.supported()) window.speechSynthesis.cancel();
  }
}
