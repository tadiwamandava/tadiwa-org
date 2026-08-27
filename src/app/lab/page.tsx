import type { Metadata } from "next";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Lab",
  description:
    "Things you can run in your own browser: an inference engine and a vector index, both compiled to WebAssembly from source I wrote.",
};

/**
 * The demos hub.
 *
 * Listed with honest status rather than hidden until finished — a dated,
 * visible trajectory reads better than a page that appears from nowhere. Each
 * entry becomes a real route as it lands.
 */
const DEMOS = [
  {
    slug: "search",
    title: "Vector search, client-side",
    blurb:
      "Semantic search across everything here, running against an HNSW index I wrote in Rust and compiled to WebAssembly. No API call, no server round-trip — the index ships with the page and queries resolve in single-digit milliseconds.",
    status: "building" as const,
    eta: "September 2026",
  },
  {
    slug: "inference",
    title: "A language model running in this tab",
    blurb:
      "A small transformer whose forward pass I wrote by hand in C++ and compiled to WebAssembly with SIMD. Int8-quantised weights, streaming generation, and a live readout of tokens/sec so you can watch the quantisation trade-off happen.",
    status: "building" as const,
    eta: "January 2027",
  },
  {
    slug: "riscv",
    title: "Step through a RISC-V core",
    blurb:
      "The RV32I core from my hardware track, simulated in the browser: single-step instructions, watch the pipeline registers, and see forwarding and load-use stalls resolve cycle by cycle.",
    status: "planned" as const,
    eta: "June 2027",
  },
] as const;

export default function LabPage() {
  return (
    <Container className="py-16">
      <header>
        <h1 className="font-display text-4xl tracking-tight">Lab</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Claims are cheap, so these are things you can run yourself. Everything
          here executes in your browser, from source I wrote — no server doing
          the interesting part off-screen.
        </p>
      </header>

      <ul className="mt-12 space-y-px overflow-hidden rounded-lg border border-border">
        {DEMOS.map((demo) => (
          <li key={demo.slug} className="bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-xl">{demo.title}</h2>
              <span className="font-mono text-2xs tracking-wide text-subtle uppercase">
                {demo.status === "building" ? "In progress" : "Planned"} ·{" "}
                {demo.eta}
              </span>
            </div>
            <p className="mt-2.5 max-w-2xl leading-relaxed text-muted">
              {demo.blurb}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm leading-relaxed text-subtle">
        These are listed before they exist on purpose. The dates are real
        commitments, and this page is the record of whether I hit them.
      </p>
    </Container>
  );
}
