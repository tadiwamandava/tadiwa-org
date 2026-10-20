import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Lab",
  description: "Browser demos of a Rust vector index and a C++ transformer inference engine.",
};

const DEMOS = [
  {
    title: "Vector search",
    blurb: "A Rust HNSW index with recall and timings measured against a brute-force scan.",
    href: "/lab/search",
  },
  {
    title: "Language-model inference",
    blurb: "A C++ transformer engine compiled to WebAssembly, with local generation and source retrieval.",
    href: "/lab/inference",
  },
];

export default function LabPage() {
  return (
    <Container className="py-16">
      <h1 className="font-display text-4xl tracking-tight">Lab</h1>
      <ul className="mt-12 divide-y divide-border border-y border-border">
        {DEMOS.map((demo) => (
          <li key={demo.href} className="py-7">
            <h2 className="font-sans text-xl font-medium">
              <Link href={demo.href} className="inline-flex min-h-11 items-center underline decoration-border-strong underline-offset-4 hover:text-accent">
                {demo.title}
              </Link>
            </h2>
            <p className="mt-2 max-w-2xl leading-relaxed text-muted">{demo.blurb}</p>
          </li>
        ))}
      </ul>
    </Container>
  );
}
