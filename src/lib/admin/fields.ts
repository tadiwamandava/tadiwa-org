/**
 * The form, derived from the schema.
 *
 * The editor does not contain a hand-written list of fields. It walks the Zod
 * schema at module load and produces a `FieldSpec` tree, and the form renders
 * that tree. The property this buys: a field added to
 * `src/lib/content/schema.ts` CANNOT be silently absent from the editor,
 * because there is no second list to forget to update.
 *
 * The walk is deliberately total, every Zod node it meets must be one of the
 * shapes below, and an unrecognised one throws at import time rather than
 * being skipped. A new field of an unsupported shape therefore breaks /admin
 * loudly on the next dev-server boot, which is the failure mode you want.
 *
 * `FIELD_HINTS` is the one hand-maintained table, and it is deliberately
 * powerless: it can only annotate a field that the walk already found
 * (a nicer label, help text, a textarea instead of an input). It cannot add a
 * field and it cannot remove one. `assertHintsResolve()` fails if a hint names
 * a path the schema no longer has, so the table cannot rot silently either.
 *
 * This module is imported by client components, keep it free of `node:*` and
 * of `server-only`.
 */

import type { z } from "zod";
import {
  projectFrontmatterSchema,
  postFrontmatterSchema,
} from "../content/schema.ts";

/* ---------------------------------------------------------------------------
   Minimal structural view of Zod 4's internals.

   Zod does not publish a stable reflection API, so this is the one place that
   knows the shape of `.def`. Verified against zod 4.4.3; if a major bump moves
   these, every failure lands here rather than being spread across the UI.
   ------------------------------------------------------------------------ */

interface CheckDef {
  check: string;
  minimum?: number;
  maximum?: number;
  value?: number;
  inclusive?: boolean;
  format?: string;
  pattern?: RegExp;
}

interface ZodDef {
  type: string;
  checks?: { _zod: { def: CheckDef } }[];
  innerType?: ZodNode;
  element?: ZodNode;
  entries?: Record<string, string>;
  keyType?: ZodNode;
  valueType?: ZodNode;
  defaultValue?: unknown;
  shape?: Record<string, ZodNode>;
}

interface ZodNode {
  def: ZodDef;
  shape?: Record<string, ZodNode>;
}

function node(schema: unknown): ZodNode {
  return schema as ZodNode;
}

function checks(n: ZodNode): CheckDef[] {
  return (n.def.checks ?? []).map((c) => c._zod.def);
}

/* ---------------------------------------------------------------------------
   Field specs
   ------------------------------------------------------------------------ */

export interface BaseSpec {
  /** Path segments from the frontmatter root, `["decisions", "why"]`. */
  path: string[];
  key: string;
  label: string;
  help?: string;
  /** True when the schema accepts the field being absent. */
  optional: boolean;
  /** Present when the schema fills a value in for you. */
  defaultValue?: unknown;
}

export type FieldSpec =
  | (BaseSpec & {
      kind: "string";
      multiline: boolean;
      minLength?: number;
      maxLength?: number;
    })
  | (BaseSpec & { kind: "date" })
  | (BaseSpec & { kind: "number"; integer: boolean; min?: number; max?: number })
  | (BaseSpec & { kind: "boolean" })
  | (BaseSpec & { kind: "enum"; options: string[] })
  | (BaseSpec & {
      kind: "string-list";
      multiline: boolean;
      minItems?: number;
      maxItems?: number;
    })
  | (BaseSpec & { kind: "enum-list"; options: string[]; minItems?: number })
  | (BaseSpec & {
      kind: "object-list";
      fields: FieldSpec[];
      minItems?: number;
      maxItems?: number;
      /** Which child field labels a collapsed row in the UI. */
      titleField: string;
    })
  | (BaseSpec & {
      kind: "record-number";
      options: string[];
      min?: number;
      max?: number;
    });

/* ---------------------------------------------------------------------------
   Presentation hints, annotation only, never structure.
   ------------------------------------------------------------------------ */

interface Hint {
  label?: string;
  help?: string;
  /** Force a textarea (or force it off) where the derived guess is wrong. */
  multiline?: boolean;
  /** For object-lists: the child field shown in the collapsed row header. */
  titleField?: string;
}

/** Keyed by dotted path. `decisions.why` annotates `why` inside `decisions`. */
const FIELD_HINTS: Record<string, Hint> = {
  pitch: {
    help: "One sentence: what it is + the hardest thing about it. 20–200 chars.",
  },
  status: { help: "shipped needs a finished date; building and planned must not have one." },
  started: { label: "Started" },
  finished: { help: "Required when status is shipped, forbidden otherwise." },
  domains: { help: "At least one." },
  languages: { help: "At least one. Shown as filter chips on /projects." },
  hardestThing: { help: "2–3 sentences framing the difficulty. Min 40 chars." },
  decisions: {
    titleField: "made",
    help: "A decision without a rejected alternative is a default, not a decision.",
  },
  "decisions.regret": { label: "Changed my mind since" },
  benchmarks: { titleField: "title", help: "Each set needs at least two runs to be a comparison." },
  "benchmarks.hardware": { help: "The actual machine, CPU, RAM, disk. Min 10 chars." },
  "benchmarks.methodology": { help: "Reps, warmup, and what was held constant. Min 30 chars." },
  "benchmarks.gapAnalysis": {
    help: "Why the reference is still faster. Min 40 chars, honest gap analysis reads as competence.",
  },
  "benchmarks.runs": { titleField: "label" },
  "benchmarks.runs.isReference": { label: "Is a baseline I am measured against" },
  "benchmarks.runs.variance": { label: "Variance (±)" },
  wouldDoDifferently: { multiline: true },
  artifacts: { titleField: "label" },
  "artifacts.href": { label: "URL or path" },
  metrics: { titleField: "label", help: "Card-face numbers. At most 4." },
  "metrics.value": { label: "Value", help: "Numbers, not adjectives." },
  "metrics.title": { label: "Tooltip" },
  resumeBullets: {
    multiline: true,
    help: "Strong verb + what + how + measured outcome. /tailor selects from these; it never writes new ones.",
  },
  roleRelevance: { help: "0 = irrelevant, 3 = lead with this. Drives /tailor ordering." },
  pinOrder: { help: "Only meaningful when featured. Must be unique across featured projects." },
  sourceAvailable: { label: "Source is public" },
  sourceNote: { multiline: true, help: "Shown instead of a dead repo link when source is not public." },
  description: { help: "20–300 chars. Used for the meta description and the OG card." },
  project: { help: "Slug of the project this documents. Must exist, or check:content fails." },
  draft: { help: "Drafts render in dev and are hidden in production." },
};

/* ---------------------------------------------------------------------------
   The walk
   ------------------------------------------------------------------------ */

function titleCase(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Unwrapped {
  inner: ZodNode;
  optional: boolean;
  defaultValue?: unknown;
}

/** Peels `optional` / `default` / `nullable` wrappers off a field. */
function unwrap(n: ZodNode): Unwrapped {
  let current = n;
  let optional = false;
  let defaultValue: unknown;

  for (let guard = 0; guard < 8; guard++) {
    const type = current.def.type;
    if (type === "optional" || type === "nullable") {
      optional = true;
      current = current.def.innerType as ZodNode;
      continue;
    }
    if (type === "default" || type === "prefault") {
      optional = true;
      const raw = current.def.defaultValue;
      defaultValue = typeof raw === "function" ? (raw as () => unknown)() : raw;
      current = current.def.innerType as ZodNode;
      continue;
    }
    break;
  }
  return { inner: current, optional, defaultValue };
}

function shapeOf(n: ZodNode): Record<string, ZodNode> {
  const shape = n.shape ?? n.def.shape;
  if (!shape) throw new Error("Zod object node has no shape");
  return shape;
}

function enumOptions(n: ZodNode): string[] {
  const entries = n.def.entries;
  if (!entries) throw new Error("Zod enum node has no entries");
  return Object.values(entries);
}

function describeField(key: string, schema: ZodNode, parentPath: string[]): FieldSpec {
  const path = [...parentPath, key];
  const dotted = path.join(".");
  const hint = FIELD_HINTS[dotted] ?? {};
  const { inner, optional, defaultValue } = unwrap(schema);
  const base: BaseSpec = {
    path,
    key,
    label: hint.label ?? titleCase(key),
    help: hint.help,
    optional,
    defaultValue,
  };
  const c = checks(inner);
  const find = (name: string) => c.find((x) => x.check === name);

  switch (inner.def.type) {
    case "string": {
      const format = find("string_format");
      // The only regex in the corpus schema is the ISO date one, and a date
      // input is strictly better than a text box for it.
      if (format?.format === "regex" && String(format.pattern).includes("\\d{4}")) {
        return { ...base, kind: "date" };
      }
      const minLength = find("min_length")?.minimum;
      const maxLength = find("max_length")?.maximum;
      const derivedMultiline =
        (maxLength ?? Number.POSITIVE_INFINITY) > 120 || (minLength ?? 0) >= 20;
      return {
        ...base,
        kind: "string",
        multiline: hint.multiline ?? derivedMultiline,
        minLength,
        maxLength,
      };
    }

    case "number": {
      const gt = find("greater_than");
      const lt = find("less_than");
      return {
        ...base,
        kind: "number",
        integer: find("number_format")?.format === "safeint",
        min: gt ? (gt.inclusive ? gt.value : (gt.value ?? 0) + 1) : undefined,
        max: lt ? (lt.inclusive ? lt.value : (lt.value ?? 0) - 1) : undefined,
      };
    }

    case "boolean":
      return { ...base, kind: "boolean" };

    case "enum":
      return { ...base, kind: "enum", options: enumOptions(inner) };

    case "array": {
      const element = unwrap(inner.def.element as ZodNode).inner;
      const minItems = find("min_length")?.minimum;
      const maxItems = find("max_length")?.maximum;

      if (element.def.type === "enum") {
        return { ...base, kind: "enum-list", options: enumOptions(element), minItems };
      }
      if (element.def.type === "string") {
        return {
          ...base,
          kind: "string-list",
          multiline: hint.multiline ?? false,
          minItems,
          maxItems,
        };
      }
      if (element.def.type === "object") {
        const fields = describeObjectNode(element, path);
        return {
          ...base,
          kind: "object-list",
          fields,
          minItems,
          maxItems,
          titleField: hint.titleField ?? fields[0].key,
        };
      }
      throw new Error(`${dotted}: arrays of ${element.def.type} are not supported by the editor`);
    }

    case "record": {
      const value = unwrap(inner.def.valueType as ZodNode).inner;
      const keyType = unwrap(inner.def.keyType as ZodNode).inner;
      if (keyType.def.type !== "enum" || value.def.type !== "number") {
        throw new Error(`${dotted}: only enum-keyed number records are supported by the editor`);
      }
      const vc = checks(value);
      const gt = vc.find((x) => x.check === "greater_than");
      const lt = vc.find((x) => x.check === "less_than");
      return {
        ...base,
        kind: "record-number",
        options: enumOptions(keyType),
        min: gt?.value,
        max: lt?.value,
      };
    }

    default:
      throw new Error(
        `${dotted}: Zod type "${inner.def.type}" has no editor representation. ` +
          `Add one in src/lib/admin/fields.ts, the schema is the contract.`,
      );
  }
}

function describeObjectNode(objectNode: ZodNode, parentPath: string[]): FieldSpec[] {
  return Object.entries(shapeOf(objectNode)).map(([key, child]) =>
    describeField(key, child, parentPath),
  );
}

/** Walks a Zod object schema into the field tree the editor renders. */
export function describeObject(schema: z.ZodType): FieldSpec[] {
  return describeObjectNode(node(schema), []);
}

/** Top-level keys in schema order, also the canonical YAML key order. */
export function keyOrder(schema: z.ZodType): string[] {
  return Object.keys(shapeOf(node(schema)));
}

export const PROJECT_FIELDS: FieldSpec[] = describeObject(projectFrontmatterSchema);
export const POST_FIELDS: FieldSpec[] = describeObject(postFrontmatterSchema);
export const PROJECT_KEY_ORDER: string[] = keyOrder(projectFrontmatterSchema);
export const POST_KEY_ORDER: string[] = keyOrder(postFrontmatterSchema);

/* ---------------------------------------------------------------------------
   Self-checks
   ------------------------------------------------------------------------ */

function collectPaths(fields: FieldSpec[], out: Set<string> = new Set()): Set<string> {
  for (const field of fields) {
    out.add(field.path.join("."));
    if (field.kind === "object-list") collectPaths(field.fields, out);
  }
  return out;
}

/**
 * Every schema key is represented, and every hint names a real field.
 *
 * The first half is structurally guaranteed by the walk; asserting it anyway
 * costs nothing and turns a future refactor that reintroduces a hand-written
 * field list into a hard failure instead of a missing input.
 */
export function assertFieldCoverage(): void {
  for (const [schema, fields, label] of [
    [projectFrontmatterSchema, PROJECT_FIELDS, "project"],
    [postFrontmatterSchema, POST_FIELDS, "post"],
  ] as const) {
    const covered = collectPaths(fields);
    const missing = keyOrder(schema).filter((k) => !covered.has(k));
    if (missing.length > 0) {
      throw new Error(
        `Admin editor is missing ${label} field(s): ${missing.join(", ")}. ` +
          `See src/lib/admin/fields.ts.`,
      );
    }
  }

  const allPaths = new Set([
    ...collectPaths(PROJECT_FIELDS),
    ...collectPaths(POST_FIELDS),
  ]);
  const stale = Object.keys(FIELD_HINTS).filter((p) => !allPaths.has(p));
  if (stale.length > 0) {
    throw new Error(
      `FIELD_HINTS names field(s) the schema no longer has: ${stale.join(", ")}. ` +
        `Delete them from src/lib/admin/fields.ts.`,
    );
  }
}
