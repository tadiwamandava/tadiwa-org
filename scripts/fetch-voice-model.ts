/**
 * Warms the Whisper cache so `npm run build:model` has something to copy.
 *
 * Separate from build-embeddings.ts because they are different models pulled
 * for different features, and a search-index rebuild should not drag 42 MB of
 * speech weights along with it.
 *
 * q8 deliberately. fp32 whisper-tiny is ~150 MB and the accuracy difference on
 * short spoken questions does not survive the microphone.
 */
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;

const MODEL = "onnx-community/whisper-tiny.en";

const t0 = Date.now();
console.log(`\n  fetching ${MODEL} (q8) …`);
const asr = await pipeline("automatic-speech-recognition", MODEL, { dtype: "q8" });

// One second of silence. Proves the files downloaded intact, a truncated
// cache fails here rather than in a visitor's browser.
//
// It proves NOTHING about whether the browser can run them. onnxruntime-node
// and onnxruntime-web are different runtimes, and these exact q8 files load
// here while failing in the browser unless the QDQ graph optimiser is turned
// off. That was found with scripts/cdp.mjs against a real Chrome; see the
// comment in src/components/nano/voice.ts.
const out = await asr(new Float32Array(16000));

console.log(`  ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  smoke test returned ${JSON.stringify(out)}`);
console.log(`\n  now run 'npm run build:model' to copy it into public/models/\n`);
