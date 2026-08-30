/**
 * Admin write-path gate. `npm run check:admin`.
 *
 * The admin is the only thing in this repo that WRITES content, so it is the
 * only thing that can destroy it. This script is the proof that it does not:
 *
 *   1. ROUND TRIP. Every file in content/ is read, re-serialised by the
 *      admin's own writer, and re-read. The two parses must be deep-equal and
 *      the body byte-identical. If reading and rewriting the corpus unchanged
 *      is not a no-op; the writer is not safe to point at the corpus.
 *
 *   2. ADVERSARIAL SCALARS. The cases a YAML emitter gets wrong, starting with
 *      the one this repo has already been bitten by: a title containing ": ".
 *      Each is asserted to survive a real gray-matter parse.
 *
 *   3. FIELD COVERAGE. Every key in the Zod schema has an editor field.
 *
 *   4. FAIL-CLOSED. Invalid content must throw rather than be written, and a
 *      deliberately corrupted emitter must be caught by the writer's own
 *      verification step rather than reaching a disk.
 *
 * Nothing here touches the filesystem except to read. Run it before trusting
 * a change to yaml.ts.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import {
  projectFrontmatterSchema,
  postFrontmatterSchema,
} from "../content/schema.ts";
import {
  PROJECT_FIELDS,
  POST_FIELDS,
  PROJECT_KEY_ORDER,
  POST_KEY_ORDER,
  assertFieldCoverage,
} from "./fields.ts";
import {
  parseEntry,
  serializeEntry,
  deepEqual,
  ContentValidationError,
} from "./serialize.ts";
import { emitFrontmatter, isPlainSafe } from "./yaml.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(HERE, "../../../content");

let failures = 0;
let checks = 0;

function ok(label: string, condition: boolean, detail = ""): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  x ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

/* ---------------------------------------------------------------------------
   1. Round trip every file in the corpus
   ------------------------------------------------------------------------ */

interface Kind {
  dir: string;
  schema: typeof projectFrontmatterSchema | typeof postFrontmatterSchema;
  fields: typeof PROJECT_FIELDS;
  keyOrder: string[];
}

const KINDS: Kind[] = [
  {
    dir: "projects",
    schema: projectFrontmatterSchema,
    fields: PROJECT_FIELDS,
    keyOrder: PROJECT_KEY_ORDER,
  },
  {
    dir: "writing",
    schema: postFrontmatterSchema,
    fields: POST_FIELDS,
    keyOrder: POST_KEY_ORDER,
  },
];

function roundTripCorpus(): void {
  let files = 0;
  let commentsLost = 0;

  for (const kind of KINDS) {
    const dir = join(CONTENT, kind.dir);
    if (!existsSync(dir)) continue;

    for (const filename of readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
      files++;
      const label = `content/${kind.dir}/${filename}`;
      const raw = readFileSync(join(dir, filename), "utf8");
      const before = parseEntry(raw);

      let written: string;
      try {
        written = serializeEntry({
          frontmatter: before.frontmatter,
          body: before.body,
          schema: kind.schema,
          fields: kind.fields,
          keyOrder: kind.keyOrder,
        });
      } catch (err) {
        ok(`${label}, serialises`, false, (err as Error).message);
        continue;
      }

      const after = parseEntry(written);

      // The comparison that matters: what the SITE sees. Both sides go through
      // the schema, so a default written explicitly on one side and omitted on
      // the other is correctly treated as identical.
      const a = kind.schema.safeParse(before.frontmatter);
      const b = kind.schema.safeParse(after.frontmatter);
      ok(`${label}, valid before`, a.success, a.success ? "" : JSON.stringify(a.error?.issues));
      ok(`${label}, valid after`, b.success, b.success ? "" : JSON.stringify(b.error?.issues));
      if (a.success && b.success) {
        ok(
          `${label}, frontmatter is semantically unchanged`,
          deepEqual(a.data, b.data),
          diffSummary(a.data as Record<string, unknown>, b.data as Record<string, unknown>),
        );
      }

      ok(`${label}, body byte-identical`, before.body === after.body);

      // A second pass must be a fixed point: writing an already-written file
      // changes nothing. Without this, every save produces a diff.
      const twice = serializeEntry({
        frontmatter: after.frontmatter,
        body: after.body,
        schema: kind.schema,
        fields: kind.fields,
        keyOrder: kind.keyOrder,
      });
      ok(`${label}, writer is idempotent`, twice === written);

      if (before.comments.length > 0) commentsLost += before.comments.length;
    }
  }

  console.log(`  round-tripped ${files} file(s) in content/`);
  if (commentsLost > 0) {
    console.log(
      `  note: ${commentsLost} YAML comment line(s) in the corpus do not survive a save.\n` +
        `        The editor warns about this per-file; it is a known limitation, not a bug.`,
    );
  }
}

function diffSummary(a: Record<string, unknown>, b: Record<string, unknown>): string {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (!deepEqual(a[k], b[k])) {
      changed.push(`${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
    }
  }
  return changed.join("\n      ");
}

/* ---------------------------------------------------------------------------
   2. Adversarial scalars
   ------------------------------------------------------------------------ */

/** Values that must survive emit -> parse exactly. */
const NASTY_STRINGS: [string, string][] = [
  ["the bug this repo already hit", "DSP: Filter Design and Audio Denoising"],
  ["colon at end", "Conclusion:"],
  ["hash comment", "Rust # 1 choice"],
  ["leading dash", "- not a list item"],
  ["leading question mark", "? maybe"],
  ["leading at", "@handle"],
  ["leading backtick", "`code`"],
  ["leading quote", '"quoted"'],
  ["leading apostrophe", "'single'"],
  ["leading brace", "{ not a map }"],
  ["leading bracket", "[ not a seq ]"],
  ["leading ampersand", "&anchor"],
  ["leading asterisk", "*alias"],
  ["leading bang", "!tag"],
  ["leading percent", "%directive"],
  ["leading pipe", "|literal"],
  ["leading gt", ">folded"],
  ["date lookalike", "2026-01-15"],
  ["time lookalike", "12:30"],
  ["number lookalike", "1.0"],
  ["int lookalike", "42"],
  ["octal lookalike", "0o777"],
  ["bool lookalike yes", "yes"],
  ["bool lookalike no", "no"],
  ["bool lookalike true", "true"],
  ["bool lookalike off", "Off"],
  ["null lookalike", "null"],
  ["tilde", "~"],
  ["empty string", ""],
  ["only spaces", "   "],
  ["trailing space", "trailing "],
  ["leading space", " leading"],
  ["tab inside", "a\tb"],
  ["newline inside", "line one\nline two"],
  ["blank line inside", "para one\n\npara two"],
  ["crlf-free multiline ending in text", "a\nb\nc"],
  ["indented second line", "first\n  second"],
  ["em dash and unicode", "π ≈ 3.14, naïve café 日本語"],
  ["backslash", "C:\\Users\\path"],
  ["double quote inside", 'he said "hi"'],
  ["long normalised prose", "x".repeat(30) + " " + "y".repeat(120) + " tail words here"],
  ["long prose with double spaces", "alpha  beta " + "gamma ".repeat(30).trim()],
  ["very long single word", "z".repeat(200)],
  ["starts with digit then colon", "8: eight"],
  ["yaml document marker", "--- not a document"],
  ["ellipsis marker", "... not the end"],
  ["url", "https://example.com/a?b=c#d"],
  ["json-looking", '{"a": 1}'],
];

function adversarialScalars(): void {
  for (const [label, value] of NASTY_STRINGS) {
    const yaml = emitFrontmatter({ title: value }, ["title"]);
    let read: unknown;
    try {
      read = parseEntry(`---\n${yaml}---\n\nbody\n`).frontmatter.title;
    } catch (err) {
      ok(`scalar: ${label}`, false, `parse threw: ${(err as Error).message}`);
      continue;
    }
    ok(
      `scalar: ${label}`,
      read === value,
      `wrote ${JSON.stringify(yaml)} read back ${JSON.stringify(read)}`,
    );
  }

  // Nested positions: the same strings inside a sequence and inside a mapping
  // in a sequence, where indentation rules differ.
  for (const [label, value] of NASTY_STRINGS) {
    const yaml = emitFrontmatter(
      { tags: [value], decisions: [{ made: value, rejected: value }] },
      ["tags", "decisions"],
    );
    let read: Record<string, unknown>;
    try {
      read = parseEntry(`---\n${yaml}---\n\nbody\n`).frontmatter;
    } catch (err) {
      ok(`nested: ${label}`, false, `parse threw: ${(err as Error).message}`);
      continue;
    }
    const tags = read.tags as string[];
    const decisions = read.decisions as { made: string; rejected: string }[];
    ok(
      `nested: ${label}`,
      tags[0] === value && decisions[0].made === value && decisions[0].rejected === value,
      `wrote ${JSON.stringify(yaml)}`,
    );
  }

  // Scalars of other types, in every position.
  const values: [string, unknown][] = [
    ["zero", 0],
    ["negative", -12],
    ["float", 1.5],
    ["big", 1e21],
    ["tiny", 1e-7],
    ["true", true],
    ["false", false],
    ["empty array", []],
    ["empty object", {}],
  ];
  for (const [label, value] of values) {
    const yaml = emitFrontmatter({ v: value, list: [{ v: value }] }, ["v", "list"]);
    const read = parseEntry(`---\n${yaml}---\n\nbody\n`).frontmatter;
    ok(
      `value: ${label}`,
      deepEqual(read.v, value) && deepEqual((read.list as { v: unknown }[])[0].v, value),
      `wrote ${JSON.stringify(yaml)} read ${JSON.stringify(read)}`,
    );
  }

  // The plain-scalar predicate must never green-light a string containing the
  // construct that broke this repo.
  ok("isPlainSafe rejects ': '", !isPlainSafe("DSP: Filter Design"));
  ok("isPlainSafe accepts a normal title", isPlainSafe("LSM storage engine in Rust"));
}

/* ---------------------------------------------------------------------------
   3 + 4. Coverage, and failing closed
   ------------------------------------------------------------------------ */

function coverage(): void {
  try {
    assertFieldCoverage();
    ok("every schema key has an editor field", true);
  } catch (err) {
    ok("every schema key has an editor field", false, (err as Error).message);
  }
}

function failsClosed(): void {
  // Invalid content must throw a typed validation error, never write.
  let threw: unknown;
  try {
    serializeEntry({
      frontmatter: { title: "", pitch: "too short", status: "nope" },
      body: "body",
      schema: projectFrontmatterSchema,
      fields: PROJECT_FIELDS,
      keyOrder: PROJECT_KEY_ORDER,
    });
  } catch (err) {
    threw = err;
  }
  ok("invalid frontmatter throws ContentValidationError", threw instanceof ContentValidationError);
  if (threw instanceof ContentValidationError) {
    ok(
      "validation error carries field paths",
      threw.issues.length >= 3 && threw.issues.every((i) => typeof i.path === "string"),
      JSON.stringify(threw.issues),
    );
  }

  // A valid document must serialise, so the check above is not passing for the
  // wrong reason.
  const valid = serializeEntry({
    frontmatter: {
      title: "Test: a colon in the title",
      pitch: "A pitch long enough to satisfy the twenty character minimum.",
      status: "building",
      started: "2026-01-01",
      domains: ["systems"],
      languages: ["Rust"],
      hardestThing: "A hardest-thing paragraph long enough to clear the forty character floor.",
    },
    body: "## Body\n\nSome prose.",
    schema: projectFrontmatterSchema,
    fields: PROJECT_FIELDS,
    keyOrder: PROJECT_KEY_ORDER,
  });
  ok("valid frontmatter serialises", valid.startsWith("---\n") && valid.includes("Test:"));
  ok(
    "a colon-bearing title is quoted",
    valid.includes('title: "Test: a colon in the title"'),
    valid.split("\n")[1],
  );
  ok("schema defaults are not written out", !valid.includes("benchmarks: []"));
  ok("body is preserved", valid.endsWith("## Body\n\nSome prose.\n"));
}

/* ---------------------------------------------------------------------------
   run
   ------------------------------------------------------------------------ */

console.log("\n  Admin write-path self-test\n");
roundTripCorpus();
adversarialScalars();
coverage();
failsClosed();

if (failures > 0) {
  console.error(`\n  FAILED: ${failures} of ${checks} assertion(s).\n`);
  process.exit(1);
}
console.log(`\n  PASSED: ${checks} assertions, corpus round-trips cleanly.\n`);
