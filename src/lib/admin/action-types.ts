/**
 * Shapes crossing the Server Action boundary.
 *
 * Separate from `src/app/admin/actions.ts` because a `"use server"` module may
 * only export async functions — everything else in it becomes a callable
 * endpoint. Types are erased, so they live here and are imported by both
 * sides.
 */

import type { FieldIssue } from "./serialize.ts";
import type { EntryKind } from "./store.ts";

export interface SavePayload {
  kind: EntryKind;
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export type SaveResult =
  | {
      ok: true;
      /** `Date.now()` at save. Doubles as the identity of this save. */
      savedAt: number;
      path: string;
      /** Non-fatal notes — e.g. YAML comments that did not survive. */
      warnings: string[];
    }
  | {
      ok: false;
      savedAt: number;
      message: string;
      /** Keyed by dotted path, so the form can put each next to its field. */
      issues: FieldIssue[];
    };

export interface CreatePayload {
  kind: EntryKind;
  title: string;
}

/** Success is a redirect, so only the failure shape ever reaches the client. */
export interface CreateResult {
  ok: false;
  message: string;
}

export type RebuildState =
  | { phase: "idle" }
  | { phase: "done"; ok: boolean; output: string; durationMs: number; finishedAt: number };
