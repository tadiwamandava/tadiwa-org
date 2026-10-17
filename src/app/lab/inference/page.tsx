import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { NanoMount } from "@/components/nano/mount";
import {
  getNanoReport,
  getParity,
  getSmolParity,
  getGroundedEvals,
  getModelMeta,
  getSmolInfo,
  getEngineBytes,
  OP_NOTES,
} from "@/lib/nano";

export const metadata: Metadata = {
  title: "Inference engine",
  description:
    "Run a C++ transformer engine in your browser and inspect its logit comparisons against PyTorch, kernel tests, and grounding evaluations.",
};

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`;

export default function InferenceLabPage() {
  const ops = getNanoReport();
  const parity = getParity();
  const smolParity = getSmolParity();
  const evals = getGroundedEvals();
  const meta = getModelMeta();
  const smol = getSmolInfo();
  const engineBytes = getEngineBytes();
  const smolAvailable =
    smol?.weightBytes != null || !!process.env.NEXT_PUBLIC_NANO_WEIGHTS_BASE;

  return (
    <Container className="py-16">
      <p className="text-sm text-muted">
        <Link href="/lab" className="text-accent hover:underline">Lab</Link> / Inference engine
      </p>
      <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight">
        A language model running in this tab.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        I wrote a transformer forward pass in C++ and compiled it to WebAssembly.
        Try local generation below, compare the model&apos;s answers with retrieved
        sources, and inspect the engine&apos;s test results.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3">
        {[
          smol ? ["SmolLM2 parameters", `${(smol.meta.params / 1e6).toFixed(0)}M`] : null,
          smol ? ["layers × dimension", `${smol.meta.n_layer} × ${smol.meta.n_embd}`] : null,
          ["engine", engineBytes ? `${kb(engineBytes)} wasm` : "wasm"],
        ].filter((x): x is [string, string] => x !== null).map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-subtle">{k}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums text-text">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 max-w-2xl space-y-3 border-l-2 border-border-strong pl-4 leading-relaxed text-muted">
        <p>
          Hugging Face trained {smol?.meta.model ?? "SmolLM2-135M-Instruct"}.{" "}
          {smol?.meta.finetuned
            ? "I fine-tuned it on retrieved-source answers and refusals, quantised its weights, and wrote the inference engine."
            : "I quantised its weights and wrote the inference engine."}{" "}
          The smaller tadiwa-nano model was trained on this site&apos;s prose.
        </p>
        <p>
          Both run locally after their weights load. When available, the hosted
          model offers a comparison: selecting it sends your question to the
          server for retrieval and generation through an external API.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="mb-5 border-b border-border pb-3 text-lg">Run the model</h2>
        <NanoMount
          smolWeightBytes={smol?.weightBytes ?? null}
          smolParams={smol?.meta.params ?? null}
          smolName={smol?.meta.model.split("/").pop() ?? null}
          smolAvailable={smolAvailable}
        />
      </section>

      {(smolParity.length > 0 || parity.length > 0) && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-3 text-lg">Comparison with PyTorch</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            The test replays a fixed prompt through the C++ engine, including
            its KV cache, one token at a time. These saved results compare the
            final logits with PyTorch. They check the tested prompt and weights;
            they do not establish that every input will match.
          </p>
          {smolParity.length > 0 && (
            <>
              <h3 className="mt-6 text-sm text-muted">
                SmolLM2-135M · {smolParity[0].vocab.toLocaleString()} logits
              </h3>
              <ParityTable rows={smolParity} />
            </>
          )}
          {parity.length > 0 && (
            <>
              <h3 className="mt-8 text-sm text-muted">
                tadiwa-nano-359K · {parity[0].vocab} logits
              </h3>
              <ParityTable rows={parity} />
            </>
          )}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
            Max |diff| is the largest logit difference; RMS describes the overall
            difference. Argmax checks whether both engines select the same next
            token. Quantisation can change the logits even when that token agrees.
          </p>
        </section>
      )}

      {evals.length > 0 && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-3 text-lg">Grounding and refusals</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            Grounded mode retrieves passages from this site before generation.
            A LoRA fine-tune teaches the model to answer from those sources or
            decline when they do not contain an answer. These saved evaluations
            compare the base model with that fine-tune on held-out pages.
          </p>
          <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Grounding evaluation results">
            <table className="w-full min-w-[560px] border-collapse">
              <caption className="sr-only">Grounded behaviour on held-out questions.</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {["Model", "Correct refusals", "Incorrect refusals", "Source overlap"].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-4 text-sm text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evals.map((e) => (
                  <tr key={e.label} className="border-b border-border">
                    <th scope="row" className="py-3 pr-4 text-left font-mono text-sm font-normal">
                      {e.label === "base" ? "SmolLM2 stock" : "+ grounded LoRA"}
                    </th>
                    <td className="py-3 pr-4 font-mono text-sm tabular-nums text-muted">
                      {e.refusalOnUnanswerable === null ? "–" : `${(e.refusalOnUnanswerable * 100).toFixed(0)}%`}
                    </td>
                    <td className="py-3 pr-4 font-mono text-sm tabular-nums text-muted">
                      {e.falseRefusalOnAnswerable === null ? "–" : `${(e.falseRefusalOnAnswerable * 100).toFixed(0)}%`}
                    </td>
                    <td className="py-3 font-mono text-sm tabular-nums text-muted">
                      {(e.groundingOfAnswers * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
            Correct refusals are measured on unanswerable questions; incorrect
            refusals on answerable ones. Source overlap measures generated
            five-word sequences found verbatim in the retrieved passages. It
            misses faithful paraphrases and can reward quotations that do not
            answer the question. It is not a factual-accuracy score.
          </p>
        </section>
      )}

      {ops && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-3 text-lg">Kernel tests</h2>
          <p className="mt-4 text-sm text-subtle">
            {ops.passing} of {ops.ops.length} matching their golden fixtures ·
            tolerance {ops.tolerance.toExponential(0)}
          </p>
          <ul className="mt-5 space-y-3">
            {ops.ops.map((r) => (
              <li key={r.op} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <span className="font-mono text-sm">
                  {r.op}
                  <span className={`ml-2 text-xs ${r.state === "pass" ? "text-shipped" : r.state === "fail" ? "text-accent" : "text-subtle"}`}>
                    {r.state === "pass" ? "pass" : r.state}
                  </span>
                </span>
                <span className="text-sm leading-relaxed text-muted">{OP_NOTES[r.op] ?? ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
            NumPy produces the reference fixtures. The softmax fixture includes
            an extreme value to test numerical stability: a version without
            max-subtraction overflows and fails that case.
          </p>
        </section>
      )}

      <section className="mt-14">
        <h2 className="border-b border-border pb-3 text-lg">Limits of this demo</h2>
        <div className="mt-5 max-w-2xl space-y-4 leading-relaxed text-muted">
          <p>
            The matrix multiply uses a cache-aware triple loop, with SIMD left
            to the compiler. Generation speed depends on your device and appears
            alongside each run. Blocking, hand-written SIMD, and fused
            dequantisation remain future work.
          </p>
          <p>
            The models can produce incorrect answers even with retrieved sources.
            This demo exercises the path from a weights file to a token: loading,
            tokenisation, attention, the KV cache, quantised kernels, and sampling.
            {smol?.weightBytes ? <> The SmolLM2 weights download is {mb(smol.weightBytes)}.</> : null}
          </p>
          {meta && (
            <p>
              The smaller model has {(meta.params / 1000).toFixed(0)}K parameters
              and was trained on {kb(meta.corpusBytes)} of prose. Its saved
              training loss is {meta.trainLoss.toFixed(2)} and validation loss
              is {meta.valLoss.toFixed(2)}. It is included to test the engine
              with a small model trained on this site.
            </p>
          )}
        </div>
      </section>
      <p className="mt-14 text-sm">
        <Link href="/lab" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Back to the lab</Link>
      </p>
    </Container>
  );
}

function ParityTable({ rows }: {
  rows: { weights: string; maxAbsDiff: number; rmsDiff: number; argmaxMatch: boolean; pass: boolean }[];
}) {
  return (
    <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Logit comparison results">
      <table className="w-full min-w-[480px] border-collapse">
        <caption className="sr-only">Logit agreement with PyTorch.</caption>
        <thead>
          <tr className="border-b border-border text-left">
            {["Weights", "Max |diff|", "RMS", "Argmax", "Verdict"].map((h) => (
              <th key={h} scope="col" className="py-2 pr-4 text-sm text-subtle">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.weights} className="border-b border-border">
              <th scope="row" className="py-3 pr-4 text-left font-mono text-sm font-normal">{p.weights}</th>
              <td className="py-3 pr-4 font-mono text-sm tabular-nums text-muted">{p.maxAbsDiff.toExponential(2)}</td>
              <td className="py-3 pr-4 font-mono text-sm tabular-nums text-muted">{p.rmsDiff.toExponential(2)}</td>
              <td className="py-3 pr-4 text-sm text-muted">{p.argmaxMatch ? "match" : "differs"}</td>
              <td className={`py-3 text-sm ${p.pass ? "text-shipped" : "text-accent"}`}>{p.pass ? "pass" : "fail"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
