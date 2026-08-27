/**
 * Content gate.
 *
 * Validates every MDX file in content/ against the Zod corpus schema, without
 * booting Next. Two reasons this exists as its own script:
 *
 *   1. It runs in a second, so it can sit in a pre-commit hook where a full
 *      build cannot.
 *   2. The corpus is the ONLY set of facts the /tailor feature is allowed to
 *      assert. A malformed or half-filled project entry is not a cosmetic
 *      problem — it is the input to something that will speak on Tadiwa's
 *      behalf to a recruiter.
 *
 * Run: npm run check:content
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";

import {
  projectFrontmatterSchema,
  postFrontmatterSchema,
} from "../src/lib/content/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(HERE, "../content");

interface Problem {
  file: string;
  path: string;
  message: string;
}

interface Entry {
  slug: string;
  file: string;
  data: Record<string, unknown>;
}

function validateDir(
  dir: string,
  schema: z.ZodType,
  label: string,
): { checked: number; problems: Problem[]; slugs: string[]; entries: Entry[] } {
  const full = join(CONTENT, dir);
  if (!existsSync(full))
    return { checked: 0, problems: [], slugs: [], entries: [] };

  const problems: Problem[] = [];
  const slugs: string[] = [];
  const entries: Entry[] = [];
  const files = readdirSync(full).filter((f) => f.endsWith(".mdx"));

  for (const filename of files) {
    const raw = readFileSync(join(full, filename), "utf8");

    // Malformed YAML throws rather than returning a result. An unquoted colon
    // in a title is the usual culprit, and it should read as one more content
    // problem rather than a stack trace.
    let data: unknown;
    let content: string;
    try {
      ({ data, content } = matter(raw));
    } catch (err) {
      problems.push({
        file: `content/${dir}/${filename}`,
        path: "(frontmatter)",
        message: `YAML did not parse — ${(err as Error).message.split("\n")[0]}. A value containing ": " must be quoted.`,
      });
      continue;
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push({
          file: `content/${dir}/${filename}`,
          path: issue.path.length ? issue.path.join(".") : "(root)",
          message: issue.message,
        });
      }
      continue;
    }

    const slug = filename.replace(/\.mdx$/, "");
    slugs.push(slug);
    entries.push({
      slug,
      file: `content/${dir}/${filename}`,
      data: result.data as Record<string, unknown>,
    });

    // A file that parses can still be empty. The body is what a reader
    // actually came for.
    if (content.trim().length < 120) {
      problems.push({
        file: `content/${dir}/${filename}`,
        path: "(body)",
        message: `${label} body is only ${content.trim().length} chars — write the thing`,
      });
    }
  }

  return { checked: files.length, problems, slugs, entries };
}

/**
 * Invariants that hold across the corpus rather than within one file — the
 * class of bug no single-file schema can see.
 */
function checkCorpusInvariants(projects: Entry[]): Problem[] {
  const problems: Problem[] = [];

  const featured = projects.filter((p) => p.data.featured === true);

  // Duplicate pinOrder means the home-page sort falls back to filesystem order,
  // which is stable enough to look intentional and arbitrary enough to be wrong.
  const byPin = new Map<number, Entry[]>();
  for (const p of featured) {
    const pin = p.data.pinOrder;
    if (typeof pin !== "number") continue;
    byPin.set(pin, [...(byPin.get(pin) ?? []), p]);
  }
  for (const [pin, group] of byPin) {
    if (group.length > 1) {
      problems.push({
        file: group.map((g) => g.file).join(", "),
        path: "pinOrder",
        message: `${group.length} featured projects share pinOrder ${pin} — home-page order is undefined`,
      });
    }
  }

  for (const p of featured) {
    if (typeof p.data.pinOrder !== "number") {
      problems.push({
        file: p.file,
        path: "pinOrder",
        message: "featured project has no pinOrder, so it sorts last by accident",
      });
    }
  }

  // A finished date before the start date is always a typo.
  for (const p of projects) {
    const { started, finished, status } = p.data as {
      started?: string;
      finished?: string;
      status?: string;
    };
    if (started && finished && finished < started) {
      problems.push({
        file: p.file,
        path: "finished",
        message: `finished (${finished}) precedes started (${started})`,
      });
    }
    if (status === "shipped" && !finished) {
      problems.push({
        file: p.file,
        path: "finished",
        message: "status is 'shipped' but there is no finished date",
      });
    }
    if (status !== "shipped" && finished) {
      problems.push({
        file: p.file,
        path: "finished",
        message: `status is '${status}' but a finished date is set`,
      });
    }
  }

  // The 30-second rule: pin your best 4–6 and nothing else. Advisory bounds,
  // but a corpus with 11 "featured" projects has no featured projects.
  if (featured.length > 6) {
    problems.push({
      file: "content/projects/",
      path: "featured",
      message: `${featured.length} projects are featured — pin 4–6, or the pinning means nothing`,
    });
  }

  return problems;
}

/** Surfaces placeholders before they reach a recruiter. Warns, never fails —
 *  they are legitimate mid-draft, but must never ship silently. */
function findPlaceholders(): Problem[] {
  const out: Problem[] = [];
  for (const dir of ["projects", "writing"]) {
    const full = join(CONTENT, dir);
    if (!existsSync(full)) continue;
    for (const filename of readdirSync(full).filter((f) => f.endsWith(".mdx"))) {
      const raw = readFileSync(join(full, filename), "utf8");
      raw.split("\n").forEach((line, i) => {
        if (/\b(TODO|CONFIRM|FIXME|XXX|Lorem ipsum)\b/i.test(line)) {
          out.push({
            file: `content/${dir}/${filename}:${i + 1}`,
            path: "placeholder",
            message: line.trim().slice(0, 90),
          });
        }
      });
    }
  }
  return out;
}

function run(): number {
  const projects = validateDir("projects", projectFrontmatterSchema, "Project");
  const posts = validateDir("writing", postFrontmatterSchema, "Post");
  const problems = [
    ...projects.problems,
    ...posts.problems,
    ...checkCorpusInvariants(projects.entries),
  ];

  console.log(
    `\n  Validated ${projects.checked} project(s), ${posts.checked} post(s)`,
  );

  // A post pointing at a project that does not exist renders a dead crosslink.
  const postDir = join(CONTENT, "writing");
  if (existsSync(postDir)) {
    for (const filename of readdirSync(postDir).filter((f) => f.endsWith(".mdx"))) {
      let data: unknown;
      try {
        ({ data } = matter(readFileSync(join(postDir, filename), "utf8")));
      } catch {
        continue; // already reported above
      }
      const ref = (data as { project?: string }).project;
      if (ref && !projects.slugs.includes(ref)) {
        problems.push({
          file: `content/writing/${filename}`,
          path: "project",
          message: `references unknown project "${ref}"`,
        });
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n  ${problems.length} problem(s):\n`);
    for (const p of problems) {
      console.error(`  ✗ ${p.file}`);
      console.error(`      ${p.path}: ${p.message}`);
    }
    console.error(
      `\n  The schema is src/lib/content/schema.ts. It is strict on purpose.\n`,
    );
    return 1;
  }

  const placeholders = findPlaceholders();
  if (placeholders.length > 0) {
    console.log(`\n  ${placeholders.length} placeholder(s) still in content:\n`);
    for (const p of placeholders) {
      console.log(`  ! ${p.file}`);
      console.log(`      ${p.message}`);
    }
    console.log(
      `\n  These are fine while drafting. They must not survive to a live deploy.`,
    );
  }

  console.log(`\n  PASSED — corpus is valid.\n`);
  return 0;
}

process.exit(run());
