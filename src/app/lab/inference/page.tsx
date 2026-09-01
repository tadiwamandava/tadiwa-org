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
    "A transformer forward pass written by hand in C++, compiled to WebAssembly, running a 135M-parameter model in your browser, with the logit-parity numbers against PyTorch.",
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

  // The weights are 129 MB, which is over GitHub's per-file ceiling, so a
  // clone may not have them. They are available if they are on disk, or if
  // this deployment points at an origin that serves them.
  const smolAvailable =
    smol?.weightBytes != null || !!process.env.NEXT_PUBLIC_NANO_WEIGHTS_BASE;

  return (
    <Container className="py-16">
      <p className="font-mono text-2xs tracking-[0.14em] text-accent uppercase">
        Lab / Inference engine
      </p>
      <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight">
        A language model running in this tab.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        A transformer forward pass written by hand in C++ and compiled to
        WebAssembly: no ML framework, no BLAS, no server. Ask the box below a
        question and the answer is computed on your machine, by about 1,500
        lines of code that I can explain line by line. The third option in the
        selector is the exception, and it is labelled as one.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[
          smol ? ["parameters", `${(smol.meta.params / 1e6).toFixed(0)}M`] : null,
          smol
            ? ["layers × dim", `${smol.meta.n_layer} × ${smol.meta.n_embd}`]
            : null,
          ["engine", engineBytes ? `${kb(engineBytes)} wasm` : "wasm"],
          ["network calls after load", "0"],
        ]
          .filter((x): x is [string, string] => x !== null)
          .map(([k, v]) => (
            <div key={k}>
              <dd className="font-mono text-xl tabular-nums text-text">{v}</dd>
              <dt className="mt-0.5 text-xs text-subtle">{k}</dt>
            </div>
          ))}
      </dl>

      {/* ---- the credit, up front ---------------------------------------- */}
      <p className="mt-8 max-w-2xl border-l-2 border-border-strong pl-4 leading-relaxed text-muted">
        <strong className="font-medium text-text">The weights are not mine.</strong>{" "}
        {smol?.meta.model ?? "SmolLM2-135M-Instruct"} was trained by Hugging
        Face.{" "}
        {smol?.meta.finetuned
          ? "I fine-tuned it to answer from retrieved sources or decline, quantised it, and wrote the code that runs it."
          : "I quantised it and wrote the code that runs it."}{" "}
        That distinction is the whole point of this page, so it goes above the
        demo rather than in a footnote:{" "}
        <em>the engine is the artefact, the model is a payload</em>. The second
        model in the selector is the opposite trade: 359K parameters I did
        train, on this site&rsquo;s own prose, and it is much worse. The third
        is neither: Kimi K3 is 2.8 trillion parameters in somebody
        else&rsquo;s datacentre, reached over an API, and it is there as the
        control. Same question, same retrieved passages, same system prompt, so
        the difference between its answer and the 135M model&rsquo;s is the
        model rather than the plumbing.
      </p>

      <section className="mt-12">
        <h2 className="mb-5 border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          Run it
        </h2>
        <NanoMount
          smolWeightBytes={smol?.weightBytes ?? null}
          smolParams={smol?.meta.params ?? null}
          smolName={smol?.meta.model.split("/").pop() ?? null}
          smolAvailable={smolAvailable}
        />
      </section>

      {/* ---- what the engine implements ---------------------------------- */}
      {smol && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
            What running a modern model actually takes
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            GPT-2 is the model everyone reimplements, and it is nine years
            old. Everything released since Llama uses a different set of
            primitives, and each of these is a place an implementation can be
            wrong while every unit test still passes.
          </p>
          <ul className="mt-5 space-y-3">
            {[
              [
                "RMSNorm",
                "LayerNorm with the mean subtraction removed. Fewer operations, one fewer parameter tensor, and no centring step to get subtly wrong.",
              ],
              [
                "RoPE",
                `Position is a rotation applied to query and key pairs rather than a vector added to the embedding. θ = ${smol.meta.rope_theta.toLocaleString()} here, and the converter refuses to guess it, because a wrong θ is exact at position 0 and drifts further every token after, which looks like a working engine for exactly as long as you test it with one token.`,
              ],
              [
                "Grouped-query attention",
                `${smol.meta.n_head} query heads share ${smol.meta.n_kv_head} key/value heads, so the KV cache is a third the size it would otherwise be. Each query head has to read the right group, and reading the wrong one produces fluent text that is subtly off.`,
              ],
              [
                "SwiGLU",
                `Two projections into ${smol.meta.n_inter} dimensions, one gated by SiLU against the other, then back down. Swapping gate and up is invisible in a shape check.`,
              ],
              [
                "Tied embeddings",
                "The token table is also the output projection, read as rows on the way in and as a matrix on the way out, which is why it is quantised per row and every other matrix per column.",
              ],
              [
                "int8, resident",
                "The codes are multiplied where they lie. Dequantising on load would be simpler and would cost 513 MB instead of 129 MB, which is the difference between a demo and a tab that dies.",
              ],
            ].map(([term, note]) => (
              <li key={term} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <span className="font-mono text-sm text-text">{term}</span>
                <span className="text-sm leading-relaxed text-muted">{note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- parity ------------------------------------------------------ */}
      {(smolParity.length > 0 || parity.length > 0) && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
            Does it match the model it came from?
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            The only claim worth making about an engine is that it computes what
            the reference computes. A fixed prompt is replayed through the C++,
            KV cache and all, one token at a time, exactly as generation runs,
            and the final logits are diffed against PyTorch&rsquo;s.
          </p>

          {smolParity.length > 0 && (
            <>
              <h3 className="mt-6 font-mono text-2xs tracking-wide text-subtle uppercase">
                SmolLM2-135M · {smolParity[0].vocab.toLocaleString()} logits
              </h3>
              <ParityTable rows={smolParity} />
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
                fp32 agrees to{" "}
                <span className="font-mono">
                  {smolParity.find((p) => p.weights === "fp32")?.maxAbsDiff.toExponential(1) ??
                    "float noise"}
                </span>{" "}
                across thirty layers, which is accumulated float noise and not a
                bug. int8 diverges by{" "}
                <span className="font-mono">
                  {smolParity.find((p) => p.weights === "int8")?.maxAbsDiff.toFixed(2) ?? "more"}
                </span>{" "}
                in the worst logit and still picks the same token. That gap is
                the quantisation itself, stated as a measurement rather than
                waved at. This number is what caught the one bug that mattered:
                a silently-defaulted RoPE θ left the engine exact at position
                zero, still selecting the right token, and wrong by 6 × 10⁻¹ by
                the fifth. Nothing but a logit diff would have found it.
              </p>
            </>
          )}

          {parity.length > 0 && (
            <>
              <h3 className="mt-8 font-mono text-2xs tracking-wide text-subtle uppercase">
                tadiwa-nano-359K · {parity[0].vocab} logits
              </h3>
              <ParityTable rows={parity} />
            </>
          )}
        </section>
      )}

      {/* ---- grounding --------------------------------------------------- */}
      {evals.length > 0 && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
            Making it stop making things up
          </h2>
          <div className="mt-4 max-w-2xl space-y-4 leading-relaxed text-muted">
            <p>
              Asked cold what a KV cache is, this model said it{" "}
              <em>&ldquo;stores the current and voltage values from previous
              cycles&rdquo;</em>. It does not know, so it interpolates from
              things that sound adjacent. No amount of fine-tuning fixes that at
              135M parameters, because there is nowhere to keep the fact.
            </p>
            <p>
              So it is not asked to recall one. The BM25 index that already
              answers ⌘K retrieves the passages, they go into the prompt, and
              the job drops from <em>know things</em> to{" "}
              <em>read four paragraphs and answer from them</em>. Try the same
              question in Chat and in Grounded above; Chat is the control, and
              it is left in for that reason.
            </p>
            <p>
              Retrieval could not fix the second half. Handed four sources that
              did not contain the answer, the base model answered anyway:{" "}
              <strong className="font-medium text-text">
                zero refusals out of fourteen
              </strong>{" "}
              on held-out questions, inventing a &ldquo;64-bit CPU with a 64-bit
              instruction set&rdquo; for a project whose sources say nothing of
              the kind. Declining <em>is</em> a short, learnable behaviour, a
              habit rather than a fact to store, so that part is a LoRA: 4.9M
              trainable parameters, 3.5% of the model, on 122 examples built
              from this corpus.
            </p>
          </div>

          <table className="mt-6 w-full border-collapse">
            <caption className="sr-only">
              Grounded behaviour on held-out questions.
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                {["Model", "Refuses when it should", "Refuses when it shouldn't", "Grounding"].map((h) => (
                  <th key={h} scope="col" className="py-2 font-mono text-2xs tracking-wide text-subtle uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evals.map((e) => (
                <tr key={e.label} className="border-b border-border">
                  <td className="py-3 font-mono text-sm">
                    {e.label === "base" ? "SmolLM2 stock" : "+ grounded LoRA"}
                  </td>
                  <td className="py-3 font-mono text-sm tabular-nums text-muted">
                    {e.refusalOnUnanswerable === null
                      ? "–"
                      : `${(e.refusalOnUnanswerable * 100).toFixed(0)}%`}
                  </td>
                  <td className="py-3 font-mono text-sm tabular-nums text-muted">
                    {e.falseRefusalOnAnswerable === null
                      ? "–"
                      : `${(e.falseRefusalOnAnswerable * 100).toFixed(0)}%`}
                  </td>
                  <td className="py-3 font-mono text-sm tabular-nums text-muted">
                    {(e.groundingOfAnswers * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
            The middle column is what keeps the first one honest. A model
            trained hard enough on refusals refuses everything, scores 100% on
            the left, and is useless. Both are always reported, and the
            training set is held under 40% refusals rather than over half.
            &ldquo;Grounding&rdquo; is the share of generated five-word
            sequences appearing verbatim in the sources: an approximation, not
            a proof. It scores a faithful paraphrase low, and it scores an
            answer drawn from the right project&rsquo;s <em>wrong section</em>
            as a success. That happened, and the number cannot see it.
            Held out by page, so the eval pages contributed nothing to
            training.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-subtle">
            The training answers are quoted from the corpus rather than written
            by a larger model. Copying from context <em>is</em> the target
            behaviour; supervision written by something smarter would teach this
            model to sound smarter, which is how you get more confident
            invention rather than less. It also keeps the claim on this page
            true of the training data too: there is no API call anywhere in
            this repository, including in what taught the model.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-subtle">
            An earlier run measured 26.7% false refusal and the obvious reading
            was over-training. Retraining at both epoch counts against the same
            data and the same eval showed the opposite: the longer run was
            better, and the first number had come from a narrower eval set, not
            from the epochs. Fifteen answerable cases means a single case is
            6.7%, small enough that the honest conclusion is that these two
            configurations are hard to tell apart, and that the earlier
            explanation was a story fitted to noise.
          </p>
        </section>
      )}

      {/* ---- ops --------------------------------------------------------- */}
      {ops && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
            The kernels underneath
          </h2>
          <p className="mt-4 text-sm text-subtle">
            {ops.passing} of {ops.ops.length} matching their golden fixtures ·
            tolerance {ops.tolerance.toExponential(0)}
          </p>
          <ul className="mt-5 space-y-3">
            {ops.ops.map((r) => (
              <li key={r.op} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <span className="font-mono text-sm">
                  {r.op}
                  <span
                    className={`ml-2 text-2xs uppercase ${
                      r.state === "pass" ? "text-shipped" : r.state === "fail" ? "text-accent" : "text-subtle"
                    }`}
                  >
                    {r.state === "pass" ? "ok" : r.state}
                  </span>
                </span>
                <span className="text-sm leading-relaxed text-muted">
                  {OP_NOTES[r.op] ?? ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
            The fixtures are data produced by a numpy oracle, not a second
            implementation. Otherwise the test only proves the two copies agree.
            One of them was too weak and said so: the softmax fixture was written
            to catch a missing max-subtraction, and when a deliberately broken
            softmax was dropped in, it passed. The sampled maximum simply never
            reached the float32 <span className="font-mono">expf</span> ceiling.
            It pins an extreme value now, and the broken version fails with{" "}
            <span className="font-mono">inf</span>.
          </p>
        </section>
      )}

      {/* ---- honesty ----------------------------------------------------- */}
      <section className="mt-14">
        <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          What this is not
        </h2>
        <div className="mt-5 max-w-2xl space-y-4 leading-relaxed text-muted">
          <p>
            <strong className="font-medium text-text">It is not fast.</strong> The
            matmul is a cache-aware triple loop with SIMD left to the compiler.
            {smolParity.length > 0 && (
              <>
                {" "}
                Natively it runs a token in about{" "}
                <span className="font-mono">
                  {smolParity.find((p) => p.weights === "int8")?.msPerToken.toFixed(0)} ms
                </span>
                , and in WebAssembly it is slower again.
              </>
            )}{" "}
            The optimisation ladder (blocking, hand-written SIMD, a fused
            dequantise-and-multiply) is the interesting part and it has not
            been climbed. Anyone reporting competitive numbers from an engine at
            this stage has a benchmark bug.
          </p>
          <p>
            <strong className="font-medium text-text">It is not a good model.</strong>{" "}
            135M parameters is small enough that it gets facts wrong
            confidently, and the demo does not hide that. It is here because it
            is the largest thing that will honestly fit down a browser
            connection, not because it is impressive on its own.
          </p>
          {meta && (
            <p>
              <strong className="font-medium text-text">The one I trained is worse still,</strong>{" "}
              and measurably: {(meta.params / 1000).toFixed(0)}K parameters on{" "}
              {kb(meta.corpusBytes)} of prose, final training loss{" "}
              <span className="font-mono">{meta.trainLoss.toFixed(2)}</span> against
              validation <span className="font-mono">{meta.valLoss.toFixed(2)}</span>.
              That gap is memorisation, more parameters than characters to
              learn from, so it reproduces fragments of this site rather than saying
              anything. It stays in the selector because the comparison is the
              content: same engine, same kernels, and the entire difference in
              output quality is the weights.
            </p>
          )}
          <p>
            <strong className="font-medium text-text">What it is</strong> is the
            whole path from a weights file to a token, written out and checked
            against a reference: the format, the loader, the tokeniser, the KV
            cache, grouped-query attention, the int8 kernel and the sampler.
            {smol?.weightBytes && (
              <> Loading it costs {mb(smol.weightBytes)}, once, and only if you ask.</>
            )}
          </p>
        </div>
      </section>

      <p className="mt-14 text-sm text-subtle">
        <Link href="/lab" className="text-accent underline decoration-dotted underline-offset-4">
          ← Back to the lab
        </Link>
      </p>
    </Container>
  );
}

function ParityTable({
  rows,
}: {
  rows: { weights: string; maxAbsDiff: number; rmsDiff: number; argmaxMatch: boolean; pass: boolean }[];
}) {
  return (
    <table className="mt-3 w-full border-collapse">
      <caption className="sr-only">Logit agreement with PyTorch.</caption>
      <thead>
        <tr className="border-b border-border text-left">
          {["Weights", "Max |diff|", "RMS", "Argmax", "Verdict"].map((h) => (
            <th key={h} scope="col" className="py-2 font-mono text-2xs tracking-wide text-subtle uppercase">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.weights} className="border-b border-border">
            <td className="py-3 font-mono text-sm">{p.weights}</td>
            <td className="py-3 font-mono text-sm tabular-nums text-muted">
              {p.maxAbsDiff.toExponential(2)}
            </td>
            <td className="py-3 font-mono text-sm tabular-nums text-muted">
              {p.rmsDiff.toExponential(2)}
            </td>
            <td className="py-3 font-mono text-2xs uppercase text-muted">
              {p.argmaxMatch ? "match" : "differs"}
            </td>
            <td className={`py-3 font-mono text-2xs uppercase ${p.pass ? "text-shipped" : "text-accent"}`}>
              {p.pass ? "pass" : "fail"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
