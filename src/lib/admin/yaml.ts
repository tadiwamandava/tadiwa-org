/**
 * A deterministic YAML emitter for corpus frontmatter.
 *
 * WHY NOT js-yaml. It is available transitively (gray-matter depends on it),
 * but reaching into a transitive dependency is how a lockfile bump breaks
 * content writes, and its `dump()` output is tuned for machines: everything
 * quoted, everything on one line, no folded blocks. The corpus is read and
 * diffed by a human, so the emitter here is style-matched to what is already
 * in content/ — flow arrays for tag-ish lists, folded `>-` blocks for prose.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT. `title: DSP: Filter Design` is not
 * valid YAML — a plain scalar cannot contain ": ", and gray-matter throws on
 * the whole file rather than mis-parsing one field. That has already happened
 * in this repo once. So the rule here is inverted from the usual: a string is
 * emitted PLAIN only when it provably survives a round trip, and every other
 * string falls back to `JSON.stringify`, which is always a valid YAML 1.2
 * double-quoted scalar. Being ugly is recoverable; being unparseable is not.
 *
 * The emitter is not a general YAML writer and does not try to be. It covers
 * exactly the value space `src/lib/content/schema.ts` can produce: strings,
 * finite numbers, booleans, arrays of those, arrays of flat objects (with one
 * further nested array, for benchmark runs), and string-keyed records.
 * Anything else throws rather than guessing.
 *
 * Callers must still verify. `serialize.ts` re-parses every document it builds
 * and deep-compares before a byte reaches the disk.
 */

/** Total line width to aim for when folding prose. Matches content/. */
const WRAP_COLUMN = 76;

/** Above this length a single-line string is folded into a `>-` block. */
const FOLD_THRESHOLD = 72;

/** Flow style (`["a", "b"]`) is only used for short, tag-like lists. */
const FLOW_MAX_ITEMS = 12;
const FLOW_MAX_ITEM_LENGTH = 28;
const FLOW_MAX_TOTAL = 74;

/** Words a YAML 1.1 parser (js-yaml's default) reads as booleans or null. */
const RESERVED_WORDS =
  /^(y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|null|Null|NULL|nan|NaN|NAN|inf|Inf|INF)$/;

/** Control characters, which always need an escape. */
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Is this string safe to write bare?
 *
 * Deliberately strict. Every rejection costs two quote characters; a false
 * accept costs the whole file.
 */
export function isPlainSafe(value: string): boolean {
  if (value.length === 0 || value.length > FOLD_THRESHOLD) return false;
  // Must open with a letter. That single rule eliminates every YAML indicator
  // ("- ? : , [ ] { } # & * ! | > ' \" % @ `), every number-lookalike, and
  // every `2026-01-15` that js-yaml would otherwise hand back as a Date.
  if (!/^[A-Za-z]/.test(value)) return false;
  if (CONTROL.test(value)) return false;
  if (/\s$/.test(value)) return false;
  // ": " opens a mapping; a trailing ":" does the same at end of line.
  if (value.includes(": ") || value.endsWith(":")) return false;
  // " #" opens a comment.
  if (value.includes(" #")) return false;
  // Collection indicators. A comma is legal inside a block-context plain
  // scalar and titles are full of them ("grep, Rebuilt and Benchmarked"), so
  // it is allowed — which is safe because `flowArray` quotes unconditionally
  // and this predicate is never consulted in flow context.
  if (/[[\]{}]/.test(value)) return false;
  if (RESERVED_WORDS.test(value)) return false;
  return true;
}

/** Always-safe scalar. JSON strings are a strict subset of YAML 1.2 double-quoted. */
function quote(value: string): string {
  return JSON.stringify(value);
}

export function emitStringScalar(value: string): string {
  return isPlainSafe(value) ? value : quote(value);
}

function emitNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Refusing to serialise non-finite number: ${String(value)}`);
  }
  // Object.is catches -0, which reads back as 0 and would fail verification.
  return Object.is(value, -0) ? "0" : String(value);
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line.length === 0) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

interface BlockScalar {
  /** `>-` or `|-`, written on the key's own line. */
  header: string;
  /** Already-indented content lines. */
  lines: string[];
}

/**
 * A block scalar, or null when one cannot represent this string exactly.
 *
 * Folded (`>-`) turns every single newline back into one space on read, so it
 * only round-trips a string whose whitespace is already normalised to single
 * spaces. Literal (`|-`) preserves newlines, but its indentation is inferred
 * from the first content line, so a leading space would be swallowed.
 */
function blockScalar(value: string, contentIndent: number): BlockScalar | null {
  if (CONTROL.test(value.replace(/\n/g, ""))) return null;
  const pad = " ".repeat(contentIndent);
  const width = Math.max(24, WRAP_COLUMN - contentIndent);

  if (value.includes("\n")) {
    // `|-` strips every trailing newline, so a value ending in one cannot be
    // represented by it. Rare enough to just quote.
    if (value.endsWith("\n")) return null;
    const lines = value.split("\n");
    // A leading space is either lost (on the first line, where the block's
    // indentation is inferred) or silently kept as content elsewhere; trailing
    // spaces survive but are invisible. Neither is worth the risk.
    if (lines.some((l) => /^\s/.test(l) || /\s$/.test(l))) return null;
    return { header: "|-", lines: lines.map((l) => (l === "" ? "" : pad + l)) };
  }

  if (value.length <= FOLD_THRESHOLD) return null;
  // Folding is lossless only if collapsing whitespace is already a no-op.
  if (value !== value.replace(/\s+/g, " ").trim()) return null;
  return { header: ">-", lines: wrap(value, width).map((l) => pad + l) };
}

function flowArray(items: readonly unknown[]): string | null {
  if (items.length === 0) return "[]";
  if (items.length > FLOW_MAX_ITEMS) return null;
  if (!items.every((i) => typeof i === "string")) return null;
  const strings = items as readonly string[];
  if (strings.some((s) => s.length > FLOW_MAX_ITEM_LENGTH || CONTROL.test(s))) {
    return null;
  }
  // Flow context has more indicators than block context, so every item is
  // quoted unconditionally — which is also what content/ already looks like.
  const rendered = `[${strings.map(quote).join(", ")}]`;
  return rendered.length <= FLOW_MAX_TOTAL ? rendered : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emitKeyed(key: string, value: unknown, indent: number): string[] {
  const pad = " ".repeat(indent);

  if (typeof value === "boolean") return [`${pad}${key}: ${value ? "true" : "false"}`];
  if (typeof value === "number") return [`${pad}${key}: ${emitNumber(value)}`];

  if (typeof value === "string") {
    const block = blockScalar(value, indent + 2);
    if (block) return [`${pad}${key}: ${block.header}`, ...block.lines];
    return [`${pad}${key}: ${emitStringScalar(value)}`];
  }

  if (Array.isArray(value)) {
    const flow = flowArray(value);
    if (flow) return [`${pad}${key}: ${flow}`];
    return [`${pad}${key}:`, ...emitSequence(value, indent)];
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined);
    if (keys.length === 0) return [`${pad}${key}: {}`];
    return [`${pad}${key}:`, ...emitMapping(value, keys, indent + 2)];
  }

  throw new Error(`Refusing to serialise ${key}: unsupported value ${typeof value}`);
}

function emitSequence(items: readonly unknown[], indent: number): string[] {
  const pad = " ".repeat(indent + 2);
  const out: string[] = [];

  for (const item of items) {
    if (isPlainObject(item)) {
      const keys = Object.keys(item).filter((k) => item[k] !== undefined);
      if (keys.length === 0) {
        out.push(`${pad}- {}`);
        continue;
      }
      // The mapping is emitted at the column the dash's content occupies, then
      // its first line is hoisted onto the dash. Continuation lines (including
      // a block scalar's body) are already at the right column.
      const lines = emitMapping(item, keys, indent + 4);
      out.push(`${pad}- ${lines[0].slice(indent + 4)}`);
      out.push(...lines.slice(1));
      continue;
    }

    if (typeof item === "string") {
      const block = blockScalar(item, indent + 4);
      if (block) {
        out.push(`${pad}- ${block.header}`);
        out.push(...block.lines);
        continue;
      }
      out.push(`${pad}- ${emitStringScalar(item)}`);
      continue;
    }

    if (typeof item === "boolean") {
      out.push(`${pad}- ${item ? "true" : "false"}`);
      continue;
    }
    if (typeof item === "number") {
      out.push(`${pad}- ${emitNumber(item)}`);
      continue;
    }
    throw new Error(`Refusing to serialise sequence item of type ${typeof item}`);
  }

  return out;
}

function emitMapping(
  obj: Record<string, unknown>,
  order: readonly string[],
  indent: number,
): string[] {
  const out: string[] = [];
  for (const key of order) {
    const value = obj[key];
    if (value === undefined) continue;
    if (value === null) {
      out.push(`${" ".repeat(indent)}${key}: null`);
      continue;
    }
    out.push(...emitKeyed(key, value, indent));
  }
  return out;
}

/**
 * Serialise a frontmatter object to YAML text, ending in a newline.
 *
 * `keyOrder` comes from the Zod shape, so field order in a written file always
 * matches field order in the schema — one canonical layout, so the diff after
 * an edit shows only what actually changed.
 */
export function emitFrontmatter(
  obj: Record<string, unknown>,
  keyOrder: readonly string[],
): string {
  const known = new Set(keyOrder);
  const extras = Object.keys(obj).filter((k) => !known.has(k) && obj[k] !== undefined);
  const order = [...keyOrder.filter((k) => obj[k] !== undefined), ...extras];
  const lines = emitMapping(obj, order, 0);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
