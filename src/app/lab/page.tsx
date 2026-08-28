import type { Metadata } from "next";
import Link from "next/link";
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
 * entry becomes a real route as it lands, and the status is the difference
 * between a promise and a link: an entry with an `href` is one you can open,
 * and nothing else on this page pretends to be.
 */
type Demo =
  | {
      slug: string;
      title: string;
      blurb: string;
      status: "live";
      href: string;
      since: string;
    }
  | {
      slug: string;
      title: string;
      blurb: string;
      status: "building" | "planned";
      eta: string;
    };

const DEMOS: Demo[] = [
  {
    slug: "search",
    title: "Vector search, client-side",
    blurb:
      "Semantic search across everything here, running on an HNSW graph I wrote in Rust and compiled to WebAssembly. The page draws the index's layer structure, measures recall against an exhaustive scan while you watch, and is straight about the finding: at this corpus size the graph is not saving any time, and the reason it is still worth having is measured rather than asserted.",
    status: "live",
    href: "/lab/search",
    since: "August 2026",
  },
  {
    slug: "inference",
    title: "A language model running in this tab",
    blurb:
      "A small transformer whose forward pass I wrote by hand in C++ and compiled to WebAssembly with SIMD. Int8-quantised weights, streaming generation, and a live readout of tokens/sec so you can watch the quantisation trade-off happen.",
    status: "building",
    eta: "January 2027",
  },
  {
    slug: "riscv",
    title: "Step through a RISC-V core",
    blurb:
      "The RV32I core from my hardware track, simulated in the browser: single-step instructions, watch the pipeline registers, and see forwarding and load-use stalls resolve cycle by cycle.",
    status: "planned",
    eta: "June 2027",
  },
];

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
              <h2 className="font-display text-xl">
                {demo.status === "live" ? (
                  <Link href={demo.href} className="hover:text-accent">
                    {demo.title}
                  </Link>
                ) : (
                  demo.title
                )}
              </h2>
              <span
                className={`font-mono text-2xs tracking-wide uppercase ${
                  demo.status === "live" ? "text-shipped" : "text-subtle"
                }`}
              >
                {demo.status === "live"
                  ? `Live · since ${demo.since}`
                  : `${demo.status === "building" ? "In progress" : "Planned"} · ${demo.eta}`}
              </span>
            </div>
            <p className="mt-2.5 max-w-2xl leading-relaxed text-muted">
              {demo.blurb}
            </p>
            {demo.status === "live" && (
              <p className="mt-3">
                <Link
                  href={demo.href}
                  className="font-mono text-2xs tracking-wide text-accent uppercase underline decoration-dotted underline-offset-4"
                >
                  Open the demo →
                </Link>
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm leading-relaxed text-subtle">
        The unfinished ones are listed before they exist on purpose. The dates
        are real commitments, and this page is the record of whether I hit them.
      </p>
    </Container>
  );
}
