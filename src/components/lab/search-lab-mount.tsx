"use client";

import dynamic from "next/dynamic";
import { Panel } from "./parts";

/**
 * The boundary between the page and everything it measures.
 *
 * `ssr: false` because the whole island is browser-only by construction, it
 * builds a WebAssembly graph and times it, and because its module graph (the
 * wasm glue, the projection maths, the worker) must never reach the
 * first-paint bundle. `npm run check:bundle` holds the home page to 150 KiB
 * gzip and it is at 140.3; this page is allowed to be expensive, but only for
 * the people who open it.
 */
const SearchLab = dynamic(() => import("./search-lab").then((m) => m.SearchLab), {
  ssr: false,
  loading: () => (
    <Panel className="mt-16">
      <p role="status" className="font-mono text-2xs text-subtle">Loading the index…</p>
    </Panel>
  ),
});

export function SearchLabMount() {
  return <SearchLab />;
}
