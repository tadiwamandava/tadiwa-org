/**
 * The local-filesystem `ContentStore`, the only driver that exists.
 *
 * Two properties are load-bearing:
 *
 * ATOMICITY. Content is written to a temp file in the same directory, fsynced,
 * and then renamed over the target. `rename(2)` within a filesystem is atomic,
 * so a reader (the dev server rebuilding on the change, or an interrupted
 * save) sees either the old file or the new one, never a truncated one. A
 * plain `writeFileSync` truncates first, and a crash in that window destroys a
 * writeup.
 *
 * VALIDATION BEFORE COMMIT. `serializeEntry` validates against the Zod schema,
 * emits, re-parses and re-validates before returning any bytes. Nothing that
 * would fail `npm run check:content` can reach the disk through here.
 *
 * Paths are rebuilt from a validated slug, never taken from the caller, so
 * there is no traversal to get wrong.
 */

import "server-only";

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

import {
  projectFrontmatterSchema,
  postFrontmatterSchema,
} from "../content/schema.ts";
import {
  PROJECT_FIELDS,
  POST_FIELDS,
  PROJECT_KEY_ORDER,
  POST_KEY_ORDER,
  type FieldSpec,
} from "./fields.ts";
import { assertWritesAllowed } from "./guard.ts";
import { findPlaceholders } from "./placeholders.ts";
import {
  parseEntry,
  serializeEntry,
  type FieldIssue,
} from "./serialize.ts";
import {
  isValidSlug,
  type ContentStore,
  type Entry,
  type EntryDraft,
  type EntryKind,
  type EntrySummary,
} from "./store.ts";

interface KindConfig {
  dir: string;
  schema: typeof projectFrontmatterSchema | typeof postFrontmatterSchema;
  fields: FieldSpec[];
  keyOrder: string[];
}

export const KIND_CONFIG: Record<EntryKind, KindConfig> = {
  project: {
    dir: "projects",
    schema: projectFrontmatterSchema,
    fields: PROJECT_FIELDS,
    keyOrder: PROJECT_KEY_ORDER,
  },
  post: {
    dir: "writing",
    schema: postFrontmatterSchema,
    fields: POST_FIELDS,
    keyOrder: POST_KEY_ORDER,
  },
};

const CONTENT_DIR = join(process.cwd(), "content");

function dirFor(kind: EntryKind): string {
  return join(CONTENT_DIR, KIND_CONFIG[kind].dir);
}

function pathFor(kind: EntryKind, slug: string): string {
  if (!isValidSlug(slug)) {
    throw new Error(`Refusing to touch an invalid slug: ${JSON.stringify(slug)}`);
  }
  return join(dirFor(kind), `${slug}.mdx`);
}

function relPathFor(kind: EntryKind, slug: string): string {
  return `content/${KIND_CONFIG[kind].dir}/${slug}.mdx`;
}

function issuesFor(kind: EntryKind, frontmatter: Record<string, unknown>): FieldIssue[] {
  const result = KIND_CONFIG[kind].schema.safeParse(frontmatter);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/**
 * Temp file + fsync + rename. The temp file is a sibling so the rename never
 * crosses a filesystem boundary, which would silently degrade to copy+unlink
 * and lose atomicity.
 */
function writeAtomic(target: string, contents: string): void {
  mkdirSync(join(target, ".."), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temp, "wx");
    writeSync(fd, contents, null, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, target);
  } catch (err) {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temp)) unlinkSync(temp);
    throw err;
  }
}

export class FilesystemContentStore implements ContentStore {
  async list(kind: EntryKind): Promise<EntrySummary[]> {
    const dir = dirFor(kind);
    if (!existsSync(dir)) return [];

    const summaries = readdirSync(dir)
      .filter((f) => f.endsWith(".mdx"))
      .map((filename): EntrySummary => {
        const slug = filename.replace(/\.mdx$/, "");
        const raw = readFileSync(join(dir, filename), "utf8");

        // A file whose YAML does not parse must still appear in the list,
        // it is the one the owner most needs to find.
        let frontmatter: Record<string, unknown> = {};
        let parseError: string | undefined;
        try {
          frontmatter = parseEntry(raw).frontmatter;
        } catch (err) {
          parseError = (err as Error).message.split("\n")[0];
        }

        const issues: FieldIssue[] = parseError
          ? [{ path: "(frontmatter)", message: `YAML did not parse, ${parseError}` }]
          : issuesFor(kind, frontmatter);

        const started = typeof frontmatter.started === "string" ? frontmatter.started : undefined;
        const finished = typeof frontmatter.finished === "string" ? frontmatter.finished : undefined;
        const published =
          typeof frontmatter.published === "string" ? frontmatter.published : undefined;

        return {
          kind,
          slug,
          path: relPathFor(kind, slug),
          title: typeof frontmatter.title === "string" ? frontmatter.title : slug,
          status: typeof frontmatter.status === "string" ? frontmatter.status : undefined,
          draft: typeof frontmatter.draft === "boolean" ? frontmatter.draft : undefined,
          date: kind === "post" ? published : (finished ?? started),
          placeholders: findPlaceholders(raw),
          valid: issues.length === 0,
          issues,
        };
      });

    // Unfinished work first, that list is the point of the page, then newest.
    return summaries.sort((a, b) => {
      const aTodo = a.placeholders.length > 0 || !a.valid;
      const bTodo = b.placeholders.length > 0 || !b.valid;
      if (aTodo !== bTodo) return aTodo ? -1 : 1;
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
  }

  async read(kind: EntryKind, slug: string): Promise<Entry | null> {
    const file = pathFor(kind, slug);
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, "utf8");
    const parsed = parseEntry(raw);
    return {
      kind,
      slug,
      path: relPathFor(kind, slug),
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      comments: parsed.comments,
      placeholders: findPlaceholders(raw),
      issues: issuesFor(kind, parsed.frontmatter),
    };
  }

  async exists(kind: EntryKind, slug: string): Promise<boolean> {
    return existsSync(pathFor(kind, slug));
  }

  async write(kind: EntryKind, slug: string, draft: EntryDraft): Promise<void> {
    assertWritesAllowed();
    const file = pathFor(kind, slug);
    if (!existsSync(file)) {
      throw new Error(`${relPathFor(kind, slug)} does not exist, use create().`);
    }
    writeAtomic(file, this.render(kind, draft));
  }

  async create(kind: EntryKind, slug: string, draft: EntryDraft): Promise<void> {
    assertWritesAllowed();
    const file = pathFor(kind, slug);
    if (existsSync(file)) {
      throw new Error(`${relPathFor(kind, slug)} already exists.`);
    }
    writeAtomic(file, this.render(kind, draft));
  }

  /** Validated, serialised, re-parsed and re-validated. Throws before writing. */
  private render(kind: EntryKind, draft: EntryDraft): string {
    const config = KIND_CONFIG[kind];
    return serializeEntry({
      frontmatter: draft.frontmatter,
      body: draft.body,
      schema: config.schema,
      fields: config.fields,
      keyOrder: config.keyOrder,
    });
  }
}

/** The one driver in use. Swap this binding to change where content lives. */
export const contentStore: ContentStore = new FilesystemContentStore();
