"use client";

import dynamic from "next/dynamic";

/**
 * Loads the palette only in the browser, and only as its own chunk.
 *
 * `ssr: false` because the palette uses <dialog>.showModal(), and its entire
 * module graph — the BM25 scorer, and behind further dynamic imports the WASM
 * glue and the embedding model — must never reach the first-paint bundle. The
 * bundle gate (`npm run check:bundle`) fails the build if it does.
 */
const CommandPalette = dynamic(
  () => import("./palette").then((m) => m.CommandPalette),
  { ssr: false },
);

export function PaletteMount() {
  return <CommandPalette />;
}
