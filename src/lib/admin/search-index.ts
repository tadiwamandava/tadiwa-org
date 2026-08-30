/**
 * The "rebuild search index" action, and the staleness check that justifies it.
 *
 * `public/search/*` is generated from the corpus at build time by
 * `npm run build:search`. Editing content does not regenerate it, so the
 * moment the owner saves a project, the ⌘K palette is answering from a stale
 * index, it will still find the old text and will not find the new. That is
 * exactly the kind of silent wrongness this site's own build-embeddings header
 * argues against, so the admin states it plainly instead of hiding it.
 *
 * It is NOT run automatically after a save. The rebuild embeds every chunk of
 * the corpus through a local transformer model; it takes tens of seconds and
 * pins a CPU. Doing that on every keystroke, or every save, would make the
 * editor unusable. It is a button, pressed when a batch of edits is done.
 *
 * Dev-only, like everything else here: it shells out, which is not something
 * that should exist in a deployed process at all.
 */

import "server-only";

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { assertWritesAllowed } from "./guard.ts";

const ROOT = process.cwd();
const SEARCH_DIR = join(ROOT, "public", "search");
const CONTENT_DIR = join(ROOT, "content");

/** The index build loads a model and embeds the whole corpus. Be generous. */
const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface IndexStatus {
  /** False when public/search has never been built. */
  built: boolean;
  /** True when some content file is newer than the index. */
  stale: boolean;
  indexBuiltAt?: string;
  newestContentAt?: string;
}

function newestMtime(dir: string, predicate: (f: string) => boolean): number {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full, predicate));
    else if (predicate(entry.name)) newest = Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * Compares mtimes rather than hashing the corpus. Cheap, and it errs toward
 * saying "stale", the failure mode is an unnecessary rebuild, not a silently
 * wrong index.
 */
export function getIndexStatus(): IndexStatus {
  const chunks = join(SEARCH_DIR, "chunks.json");
  if (!existsSync(chunks)) return { built: false, stale: true };

  const indexAt = statSync(chunks).mtimeMs;
  const contentAt = newestMtime(CONTENT_DIR, (f) => f.endsWith(".mdx"));

  return {
    built: true,
    stale: contentAt > indexAt,
    indexBuiltAt: new Date(indexAt).toISOString(),
    newestContentAt: contentAt > 0 ? new Date(contentAt).toISOString() : undefined,
  };
}

export interface RebuildResult {
  ok: boolean;
  /** Combined stdout + stderr, tail-trimmed. The script is chatty and useful. */
  output: string;
  durationMs: number;
}

/** One rebuild at a time. Two concurrent runs would race on the same files. */
let inFlight: Promise<RebuildResult> | null = null;

export function rebuildSearchIndex(): Promise<RebuildResult> {
  assertWritesAllowed();
  if (inFlight) return inFlight;

  const started = Date.now();
  const run = new Promise<RebuildResult>((resolve) => {
    // No shell: the repo path contains a space, and `npm run` needs no shell
    // features here. Arguments are fixed literals, nothing user-supplied
    // reaches this call.
    execFile(
      "npm",
      ["run", "build:search"],
      { cwd: ROOT, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        resolve({
          ok: !error,
          output: error
            ? `${output}\n\n${error.message}`.trim().slice(-8000)
            : output.slice(-8000),
          durationMs: Date.now() - started,
        });
      },
    );
  }).finally(() => {
    inFlight = null;
  });

  inFlight = run;
  return run;
}
