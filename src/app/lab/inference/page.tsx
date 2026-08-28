import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { NanoMount } from "@/components/nano/mount";
import {
  getNanoReport,
  getParity,
  getModelMeta,
  getEngineBytes,
  OP_NOTES,
} from "@/lib/nano";

export const metadata: Metadata = {
  title: "Inference engine",
  description:
    "A transformer forward pass written by hand in C++, compiled to WebAssembly, generating text in your browser — with the logit-parity numbers against PyTorch.",
};

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

export default function InferenceLabPage() {
  const ops = getNanoReport();
  const parity = getParity();
  const meta = getModelMeta();
  const engineBytes = getEngineBytes();

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
        WebAssembly — no ML framework, no BLAS, no server. The weights come from
        a small model trained on this site&rsquo;s own prose, so what it
        generates is this writing, badly.
      </p>

      {meta && (
        <dl className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
          {[
            ["parameters", `${(meta.params / 1000).toFixed(0)}K`],
            ["layers × dim", `${meta.n_layer} × ${meta.n_embd}`],
            ["engine", engineBytes ? `${(engineBytes / 1024).toFixed(0)} KB wasm` : "wasm"],
            ["network calls", "0"],
          ].map(([k, v]) => (
            <div key={k}>
              <dd className="font-mono text-xl tabular-nums text-text">{v}</dd>
              <dt className="mt-0.5 text-xs text-subtle">{k}</dt>
            </div>
          ))}
        </dl>
      )}

      <section className="mt-12">
        <h2 className="mb-5 border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          Run it
        </h2>
        <NanoMount />
      </section>

      {/* ---- parity ------------------------------------------------------ */}
      {parity.length > 0 && (
        <section className="mt-14">
          <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
            Does it match the model it came from?
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            The only claim worth making about an engine is that it computes what
            the reference computes. A fixed prompt is replayed through the C++ —
            KV cache and all, one token at a time, exactly as generation runs —
            and the final logits are diffed against PyTorch&rsquo;s.
          </p>
          <table className="mt-5 w-full border-collapse">
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
              {parity.map((p) => (
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
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
            fp32 agrees to about 8 × 10⁻⁶, which is float noise — the layout,
            the head slicing and the cache are right. int8 diverges by 0.24 in
            the worst logit, which is not a bug but the quantisation error
            itself, and it still selects the same token. That gap is the
            entire trade: a quarter of the download for a distortion small
            enough not to change the answer here.
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
        </section>
      )}

      {/* ---- honesty ----------------------------------------------------- */}
      <section className="mt-14">
        <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          What this is not
        </h2>
        <div className="mt-5 max-w-2xl space-y-4 leading-relaxed text-muted">
          {meta && (
            <p>
              <strong className="font-medium text-text">The model is bad, and measurably so.</strong>{" "}
              {(meta.params / 1000).toFixed(0)}K parameters trained on{" "}
              {kb(meta.corpusBytes)} of prose: final training loss{" "}
              <span className="font-mono">{meta.trainLoss.toFixed(2)}</span> against
              validation <span className="font-mono">{meta.valLoss.toFixed(2)}</span>.
              That gap is memorisation — there are more parameters here than
              characters to learn from, which is why the output reproduces
              fragments of this site rather than saying anything. Fixing it needs
              a bigger corpus, not a better engine.
            </p>
          )}
          <p>
            <strong className="font-medium text-text">It is not fast.</strong> The
            matmul is a cache-aware triple loop and nothing more. The optimisation
            ladder — blocking, SIMD, an int8 kernel that skips dequantisation — is
            the interesting part and it has not been climbed yet. Anyone reporting
            competitive numbers from an engine at this stage has a benchmark bug.
          </p>
          <p>
            <strong className="font-medium text-text">What it is</strong> is the
            whole path from a weights file to a token, written out and checked
            against a reference: the format, the loader, the KV cache, the
            attention, the sampler. The engine is the artefact. The model is a
            payload that happens to fit.
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
