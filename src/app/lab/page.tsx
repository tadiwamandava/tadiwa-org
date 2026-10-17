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
    }
  | {
      slug: string;
      title: string;
      blurb: string;
      status: "building" | "planned";
      /** Set once there is something to open. An in-progress build log counts,
       *  a promise does not. */
      href?: string;
    };

const DEMOS: Demo[] = [
  {
    slug: "search",
    title: "Vector search, client-side",
    blurb:
      "Query an HNSW graph written in Rust. Compare its results and timing with a brute-force scan of the same vectors.",
    status: "live",
    href: "/lab/search",
  },
  {
    slug: "inference",
    title: "A language model running in this tab",
    blurb:
      "Run a C++ forward pass compiled to WebAssembly. Inspect sources and generation timing, or compare with a hosted model when this deployment provides one.",
    status: "live",
    href: "/lab/inference",
  },
  {
    slug: "riscv",
    title: "Step through a RISC-V core",
    blurb:
      "Planned: a browser view of the RV32I core for stepping through forwarding and load-use stalls. The current implementation is described on the project page.",
    status: "planned",
  },
];

export default function LabPage() {
  return (
    <Container className="py-16">
      <header>
        <h1 className="font-display text-4xl tracking-tight">Lab</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">Run the browser demos and inspect their results. Larger model downloads require a separate click.</p>
      </header>

      <ul className="mt-12 space-y-px overflow-hidden rounded-lg border border-border">
        {DEMOS.map((demo) => (
          <li key={demo.slug} className="bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-sans text-xl font-medium">
                {demo.href ? (
                  <Link href={demo.href} className="hover:text-accent">
                    {demo.title}
                  </Link>
                ) : (
                  demo.title
                )}
              </h2>
              <span
                className={`text-2xs ${
                  demo.status === "live" ? "text-shipped" : "text-subtle"
                }`}
              >
                {demo.status === "live"
                  ? "Live"
                  : demo.status === "building"
                    ? "In progress"
                    : "Planned"}
              </span>
            </div>
            <p className="mt-2.5 max-w-2xl leading-relaxed text-muted">
              {demo.blurb}
            </p>
            {demo.href && (
              <p className="mt-3">
                <Link
                  href={demo.href}
                  className="inline-flex min-h-11 items-center text-sm text-accent underline decoration-dotted underline-offset-4"
                >
                  {demo.slug === "search" ? "Open search demo" : "Open inference demo"}
                </Link>
              </p>
            )}
            {!demo.href && <Link href="/projects/riscv-cpu-verification" className="mt-3 inline-flex min-h-11 items-center text-sm underline">Read about the RISC-V core</Link>}
          </li>
        ))}
      </ul>

    </Container>
  );
}
