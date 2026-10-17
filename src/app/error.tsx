"use client";

import Link from "next/link";
import { Container } from "@/components/ui";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <Container className="py-20">
      <h1 className="text-3xl">This page could not load.</h1>
      <p role="alert" className="mt-5 max-w-xl text-muted">
        Try loading it again. You can also return home to browse the other pages.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <button type="button" onClick={retry} className="rounded bg-accent px-5 py-3 text-accent-contrast">Try again</button>
        <Link href="/" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Return home</Link>
      </div>
    </Container>
  );
}
