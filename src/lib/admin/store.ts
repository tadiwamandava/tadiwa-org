/**
 * The storage seam.
 *
 * Everything above this interface, the pages, the forms, the Server Actions,
 * knows only about entries, slugs and frontmatter. Nothing above it knows that
 * content currently lives in `content/*.mdx` on a local disk.
 *
 * That matters because the obvious next driver is a GitHub one: the same
 * editor, committing through the API instead of writing a file, which is what
 * a deployed admin would need. Deliberately NOT implemented here, a deployed
 * write path needs an auth decision that is not this task's to make, but the
 * seam is drawn so it is a new file implementing `ContentStore`, not a rewrite.
 *
 * Constraints a second driver must honour, and which the filesystem driver
 * documents in place:
 *   - `write` is all-or-nothing. A half-written entry is a broken site.
 *   - `write` validates before it commits, so a store can never hold content
 *     that `npm run check:content` would reject.
 *   - `create` fails if the slug is taken. Never silently overwrite.
 *
 * Types only, no `node:*` here, so client components can import the shapes.
 */

import type { FieldIssue } from "./serialize.ts";

export const ENTRY_KINDS = ["project", "post"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export function isEntryKind(value: unknown): value is EntryKind {
  return typeof value === "string" && (ENTRY_KINDS as readonly string[]).includes(value);
}

/** Slugs become filenames and URL segments, so the rule is deliberately narrow. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && SLUG_PATTERN.test(value);
}

/** A placeholder left in the content, the owner's to-do queue. */
export interface Placeholder {
  line: number;
  text: string;
}

export interface EntrySummary {
  kind: EntryKind;
  slug: string;
  /** Repo-relative, for display. */
  path: string;
  title: string;
  /** Projects only. */
  status?: string;
  /** Posts only. */
  draft?: boolean;
  /** Sort key: `finished ?? started` for projects, `published` for posts. */
  date?: string;
  placeholders: Placeholder[];
  /** False when the file on disk does not satisfy the schema right now. */
  valid: boolean;
  issues: FieldIssue[];
}

export interface Entry {
  kind: EntryKind;
  slug: string;
  path: string;
  /** Raw frontmatter as parsed, NOT schema-defaulted, so nothing is invented. */
  frontmatter: Record<string, unknown>;
  body: string;
  /** YAML comments that a save will not preserve. Surfaced, never dropped quietly. */
  comments: string[];
  placeholders: Placeholder[];
  issues: FieldIssue[];
}

export interface EntryDraft {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface ContentStore {
  list(kind: EntryKind): Promise<EntrySummary[]>;
  read(kind: EntryKind, slug: string): Promise<Entry | null>;
  /** Overwrites an existing entry. Throws if it does not exist. */
  write(kind: EntryKind, slug: string, draft: EntryDraft): Promise<void>;
  /** Creates a new entry. Throws if the slug is already taken. */
  create(kind: EntryKind, slug: string, draft: EntryDraft): Promise<void>;
  exists(kind: EntryKind, slug: string): Promise<boolean>;
}
