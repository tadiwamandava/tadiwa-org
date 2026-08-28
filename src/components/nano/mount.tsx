"use client";

import dynamic from "next/dynamic";

/** Keeps the engine, the WASM glue and the weights out of the first-paint
 *  bundle. `npm run check:bundle` fails the build if they leak in. */
const NanoPlayground = dynamic(
  () => import("./playground").then((m) => m.NanoPlayground),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-subtle">
        Loading the playground…
      </div>
    ),
  },
);

export function NanoMount() {
  return <NanoPlayground />;
}
