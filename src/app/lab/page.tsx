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
 * Listed with honest status rather than hidden until finished. A dated,
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
      /** Set once there is something to open. An in-progress build log counts,
       *  a promise does not. */
      href?: string;
    };

const DEMOS: Demo[] = [
  {
    slug: "search",
    title: "Vector search, client-side",
    blurb:
      "An HNSW graph I wrote in Rust, searching this site in your tab. Recall is measured live against a brute-force scan, including the part where the graph loses.",
    status: "live",
    href: "/lab/search",
    since: "August 2026",
  },
  {
    slug: "inference",
    title: "A language model running in this tab",
    blurb:
      "SmolLM2-135M answering at about 25 tokens a second, on a forward pass I wrote in C++. No framework, no BLAS, no server.",
    status: "live",
    href: "/lab/inference",
    since: "August 2026",
  },
  {
    slug: "riscv",
    title: "Step through a RISC-V core",
    blurb:
      "The RV32I core from my hardware track, single-stepped in the browser. Watch forwarding and load-use stalls resolve cycle by cycle.",
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
          Claims are cheap. Everything here runs in your browser, from source I
          wrote.
        </p>
      </header>

      <ul className="mt-12 space-y-px overflow-hidden rounded-lg border border-border">
        {DEMOS.map((demo) => (
          <li key={demo.slug} className="bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-xl">
                {demo.href ? (
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
            {demo.href && (
              <p className="mt-3">
                <Link
                  href={demo.href}
                  className="font-mono text-2xs tracking-wide text-accent uppercase underline decoration-dotted underline-offset-4"
                >
                  {demo.status === "live" ? "Open the demo" : "See the build log"} →
                </Link>
              </p>
            )}
          </li>
        ))}
      </ul>

    </Container>
  );
}
