import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { getNanoReport, OP_NOTES, type OpState } from "@/lib/nano";

export const metadata: Metadata = {
  title: "Inference engine",
  description:
    "A transformer forward pass written by hand in C++ and compiled to WebAssembly — shown mid-build, with the op-parity tests as the progress bar.",
};

const STATE_LABEL: Record<OpState, string> = {
  pass: "matches",
  fail: "diverges",
  stub: "not started",
};

export default function InferenceLabPage() {
  const report = getNanoReport();

  return (
    <Container className="py-16">
      <p className="font-mono text-2xs tracking-[0.14em] text-accent uppercase">
        Lab / Inference engine
      </p>
      <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight">
        An engine, shown mid-build.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        A transformer forward pass written by hand in C++ and compiled to
        WebAssembly — no ML framework, no BLAS. It is unfinished, and this page
        is the honest version of a progress bar: every row below is a real
        assertion against golden fixtures, run by{" "}
        <code className="font-mono text-base">npm run test:nano</code>.
      </p>

      {/* ---- status ------------------------------------------------------ */}
      <section className="mt-12">
        <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          Op parity
        </h2>

        {report === null ? (
          <p className="mt-5 rounded-lg border border-dashed border-border-strong p-8 text-center text-muted">
            No test report on disk. Run <code>npm run test:nano</code>.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-subtle">
              {report.passing} of {report.ops.length} implemented
              {report.failing > 0 && ` · ${report.failing} diverging`} ·
              tolerance {report.tolerance.toExponential(0)}
            </p>

            <table className="mt-5 w-full border-collapse">
              <caption className="sr-only">
                Per-op agreement between this C++ implementation and the golden
                fixtures.
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 font-mono text-2xs tracking-wide text-subtle uppercase">
                    Op
                  </th>
                  <th scope="col" className="py-2 font-mono text-2xs tracking-wide text-subtle uppercase">
                    State
                  </th>
                  <th scope="col" className="py-2 text-right font-mono text-2xs tracking-wide text-subtle uppercase">
                    Max error
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.ops.map((r) => (
                  <tr key={r.op} className="border-b border-border align-top">
                    <td className="py-3 pr-4">
                      <span className="font-mono text-sm">{r.op}</span>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-subtle">
                        {OP_NOTES[r.op] ?? ""}
                      </p>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`font-mono text-2xs tracking-wide uppercase ${
                          r.state === "pass"
                            ? "text-shipped"
                            : r.state === "fail"
                              ? "text-accent"
                              : "text-subtle"
                        }`}
                      >
                        {/* State is named in text, never carried by colour alone. */}
                        {STATE_LABEL[r.state]}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-sm tabular-nums text-muted">
                      {r.state === "stub"
                        ? "—"
                        : r.maxError < 0
                          ? "inf"
                          : r.maxError.toExponential(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* ---- why it looks like this -------------------------------------- */}
      <section className="mt-14">
        <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          Why this page exists before the engine does
        </h2>
        <div className="mt-5 space-y-4 leading-relaxed text-muted">
          <p>
            The scaffolding around an inference engine — the weight format, the
            build to WebAssembly, the sampling loop, the harness that proves a
            kernel correct — is a day of plumbing. The forward pass is the part
            that takes a month and the part an interviewer will actually ask
            about. Publishing the harness first, with the ops empty, is a way of
            being straight about which half is done.
          </p>
          <p>
            The fixtures are data, not a reference implementation: inputs and
            expected outputs, generated once by a numpy oracle. There is nothing
            in the repository to copy an answer from, which is the point.
          </p>
          <p>
            One of them earned its place immediately. The softmax fixture was
            originally random values scaled by 40, meant to catch an
            implementation that forgets to subtract the row max before
            exponentiating. It did not — the sampled maximum happened to land
            under the float32 overflow threshold, and the buggy version passed.
            The fixture now pins one element at 240 explicitly, and the same bug
            fails with an error of infinity. A test whose difficulty depends on
            the random draw is not a test.
          </p>
        </div>
      </section>

      {/* ---- the shape of it --------------------------------------------- */}
      <section className="mt-14">
        <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
          What is already here
        </h2>
        <dl className="mt-5 space-y-3 text-sm">
          {[
            ["Op contracts", "engines/nano/include/nano_ops.h — shapes and semantics for each kernel, precise enough to implement from."],
            ["Golden fixtures", "engines/nano/fixtures — six binary cases plus a manifest, regenerated deterministically."],
            ["Native test loop", "clang++ build, no browser and no Emscripten, so the edit-test cycle is under a second."],
            ["WebAssembly build", "emcc with -O3 -msimd128, exporting the ops behind a plain C ABI. 7.1 KB raw today, because the ops are empty."],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="font-mono text-2xs tracking-wide text-subtle uppercase">{k}</dt>
              <dd className="leading-relaxed text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-14 text-sm text-subtle">
        <Link href="/lab" className="text-accent underline decoration-dotted underline-offset-4">
          ← Back to the lab
        </Link>
      </p>
    </Container>
  );
}
