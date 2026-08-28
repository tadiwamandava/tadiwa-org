/**
 * MDX file <-> {frontmatter, body}, with a verification step in the middle.
 *
 * The contract this module enforces, and the reason it exists:
 *
 *   1. Nothing is written that would not survive `npm run check:content`.
 *      Validation happens against the real Zod schema BEFORE serialisation.
 *   2. Nothing is written that does not read back as what was intended. Every
 *      document is re-parsed with the same gray-matter the site uses and
 *      deep-compared against the input. A mismatch throws; it never writes.
 *   3. The body is written back byte-for-byte as given.
 *
 * (2) is the interesting one. A YAML emitter is a pile of quoting rules, and
 * the failure mode of a quoting bug is a file that no longer parses — which in
 * this repo takes the whole site down, since every page reads the corpus at
 * build time. Verifying the output instead of trusting the emitter turns that
 * class of bug from "site is broken" into "save button reports an error".
 *
 * Pure: no `node:*` imports, so it can be exercised by the self-test and by
 * anything else that wants to check a document without touching a disk.
 */

import matter from "gray-matter";
import type { z } from "zod";

import { emitFrontmatter } from "./yaml.ts";
import type { FieldSpec } from "./fields.ts";

export interface ParsedEntry {
  /** Raw frontmatter, exactly as YAML gave it — NOT schema-defaulted. */
  frontmatter: Record<string, unknown>;
  /** MDX body, leading blank lines and trailing whitespace trimmed. */
  body: string;
  /**
   * YAML comment lines found in the frontmatter.
   *
   * Frontmatter is round-tripped through a data structure, so comments do not
   * survive a save. That is a real loss — two files in this corpus carry TODO
   * notes as YAML comments — so they are surfaced in the editor rather than
   * disappearing quietly.
   */
  comments: string[];
}

/** Thrown when a document fails validation. Carries per-field messages. */
export interface FieldIssue {
  /** Dotted path, e.g. `decisions.0.why`. */
  path: string;
  message: string;
}

export class ContentValidationError extends Error {
  readonly issues: FieldIssue[];
  constructor(issues: FieldIssue[]) {
    super(`Content is invalid: ${issues.length} problem(s)`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

/* ---------------------------------------------------------------------------
   Reading
   ------------------------------------------------------------------------ */

/** Whole-line YAML comments, plus obvious trailing ones. Heuristic on purpose. */
function findComments(rawFrontmatter: string): string[] {
  const out: string[] = [];
  for (const line of rawFrontmatter.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) out.push(trimmed);
  }
  return out;
}

export function parseEntry(raw: string): ParsedEntry {
  const parsed = matter(normaliseNewlines(raw));
  return {
    frontmatter: (parsed.data ?? {}) as Record<string, unknown>,
    // gray-matter hands back everything after the closing `---`, which starts
    // with the newline that terminated it. The editor shows a body that starts
    // at the first real character.
    body: parsed.content.replace(/^\n+/, "").replace(/\s+$/, ""),
    comments: findComments(parsed.matter ?? ""),
  };
}

/**
 * Browsers submit textarea content with CRLF line endings (HTML spec), and a
 * stray `\r` inside a YAML block scalar is invisible in a diff and fatal to a
 * parser. Normalise at every boundary where text arrives from a client.
 */
export function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Normalises every string in a structure that arrived from a client.
 *
 * Applied at the Server Action boundary. A `\r` that survives into a YAML
 * block scalar is invisible in review and fatal on the next parse.
 */
export function normaliseStringsDeep(value: unknown): unknown {
  if (typeof value === "string") return normaliseNewlines(value);
  if (Array.isArray(value)) return value.map(normaliseStringsDeep);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normaliseStringsDeep(v);
    }
    return out;
  }
  return value;
}

/* ---------------------------------------------------------------------------
   Comparison
   ------------------------------------------------------------------------ */

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === "object") {
    // A Date here means YAML re-read a quoted date as a timestamp — exactly
    // the corruption this comparison is here to catch, so never treat one as
    // equal to anything.
    if (a instanceof Date || b instanceof Date) return false;
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
    const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
  }
  return false;
}

/* ---------------------------------------------------------------------------
   Writing
   ------------------------------------------------------------------------ */

/** Recursively drops `undefined`, so comparisons and emission agree. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = prune(v);
    }
    return out;
  }
  return value;
}

/**
 * Drops keys whose value is exactly what the schema would have filled in.
 *
 * Without this, every project file grows `benchmarks: []`, `featured: false`,
 * `sourceAvailable: true` and six more lines that say nothing — and every
 * decision grows `regret: false`, every benchmark run `isReference: false`.
 * The parsed result is identical either way: Zod re-applies the default on
 * read, which is exactly why the omission is safe.
 *
 * Recurses into object-lists, because that is where the noise multiplies.
 */
export function stripSchemaDefaults(
  frontmatter: Record<string, unknown>,
  fields: FieldSpec[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const field of fields) {
    const value = frontmatter[field.key];
    if (value === undefined || value === null) continue;
    // An optional string left blank in the form is an absent field, not "".
    if (typeof value === "string" && value === "" && field.optional) continue;
    if (field.defaultValue !== undefined && deepEqual(value, field.defaultValue)) continue;

    if (field.kind === "object-list" && Array.isArray(value)) {
      out[field.key] = value.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? stripSchemaDefaults(item as Record<string, unknown>, field.fields)
          : item,
      );
      continue;
    }
    out[field.key] = value;
  }

  // Anything the schema does not know about is preserved rather than dropped —
  // losing a field because the editor is a version behind would be worse.
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!(k in out) && !fields.some((f) => f.key === k) && v !== undefined) out[k] = v;
  }
  return out;
}

export interface SerializeInput {
  frontmatter: Record<string, unknown>;
  body: string;
  schema: z.ZodType;
  fields: FieldSpec[];
  keyOrder: readonly string[];
}

/**
 * Validate, serialise, and verify. Returns the exact bytes to write.
 *
 * Throws `ContentValidationError` when the content is invalid (the caller
 * turns those into field errors in the form) and a plain `Error` when the
 * emitter produced something that does not read back — which is a bug in this
 * code, not in the user's input, and must never reach the disk.
 */
export function serializeEntry(input: SerializeInput): string {
  const { schema, fields, keyOrder } = input;

  const cleaned = prune(input.frontmatter) as Record<string, unknown>;

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new ContentValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }

  const toWrite = stripSchemaDefaults(cleaned, fields);
  const yaml = emitFrontmatter(toWrite, keyOrder);
  const body = normaliseNewlines(input.body).replace(/\s+$/, "");
  const file = `---\n${yaml}---\n\n${body}\n`;

  // ---- verification ------------------------------------------------------
  let reread: ParsedEntry;
  try {
    reread = parseEntry(file);
  } catch (err) {
    throw new Error(
      `Serialiser produced unparseable YAML — refusing to write. ${(err as Error).message}`,
    );
  }

  if (!deepEqual(prune(reread.frontmatter), prune(toWrite))) {
    throw new Error(
      "Serialiser round-trip mismatch — refusing to write. " +
        `Wrote ${JSON.stringify(toWrite).slice(0, 300)} but read back ` +
        `${JSON.stringify(reread.frontmatter).slice(0, 300)}`,
    );
  }

  // The re-read must also still satisfy the schema, so a save can never
  // produce a file that `npm run check:content` rejects.
  const recheck = schema.safeParse(reread.frontmatter);
  if (!recheck.success) {
    throw new Error(
      "Serialised file would fail check:content — refusing to write: " +
        recheck.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }

  if (reread.body !== body) {
    throw new Error("Serialiser altered the MDX body — refusing to write.");
  }

  return file;
}
