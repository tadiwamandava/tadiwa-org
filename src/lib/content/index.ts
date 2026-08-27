import "server-only";

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import { z } from "zod";

import {
  projectFrontmatterSchema,
  postFrontmatterSchema,
  type Project,
  type Post,
} from "./schema";

const CONTENT_DIR = join(process.cwd(), "content");
const PROJECTS_DIR = join(CONTENT_DIR, "projects");
const POSTS_DIR = join(CONTENT_DIR, "writing");

const WORDS_PER_MINUTE = 200;

function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function listMdx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .sort();
}

/**
 * Turns a Zod failure into something that names the file and the field.
 *
 * The default ZodError dump is unreadable in CI output, and content errors are
 * the ones most likely to be fixed by someone (future Tadiwa) who is not
 * holding this schema in their head.
 */
function explode(file: string, error: z.ZodError): never {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `    ${path}: ${issue.message}`;
  });
  throw new Error(
    `\nContent validation failed — ${file}\n${lines.join("\n")}\n\n` +
      `  Fix the frontmatter in that file. The schema lives in\n` +
      `  src/lib/content/schema.ts and is strict on purpose: /tailor is only\n` +
      `  allowed to assert facts that exist here.\n`,
  );
}

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

export const getAllProjects = cache((): Project[] => {
  const projects = listMdx(PROJECTS_DIR).map((filename) => {
    const slug = filename.replace(/\.mdx$/, "");
    const raw = readFileSync(join(PROJECTS_DIR, filename), "utf8");
    const { data, content } = matter(raw);

    const parsed = projectFrontmatterSchema.safeParse(data);
    if (!parsed.success) explode(`content/projects/${filename}`, parsed.error);

    return {
      ...parsed.data,
      slug,
      body: content,
      readingTimeMinutes: readingTime(content),
    } satisfies Project;
  });

  // Newest first, but anything still in flight floats above finished work —
  // recruiters track velocity, so "building" is a feature of the ordering.
  return projects.sort((a, b) => {
    const rank = { building: 0, shipped: 1, planned: 2 } as const;
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return (b.finished ?? b.started).localeCompare(a.finished ?? a.started);
  });
});

export const getProject = cache((slug: string): Project | undefined =>
  getAllProjects().find((p) => p.slug === slug),
);

/** The 4–6 that get pinned on the home page. */
export const getFeaturedProjects = cache((): Project[] =>
  getAllProjects()
    .filter((p) => p.featured)
    .sort((a, b) => (a.pinOrder ?? 99) - (b.pinOrder ?? 99)),
);

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

export const getAllPosts = cache((): Post[] => {
  const posts = listMdx(POSTS_DIR).map((filename) => {
    const slug = filename.replace(/\.mdx$/, "");
    const raw = readFileSync(join(POSTS_DIR, filename), "utf8");
    const { data, content } = matter(raw);

    const parsed = postFrontmatterSchema.safeParse(data);
    if (!parsed.success) explode(`content/writing/${filename}`, parsed.error);

    return {
      ...parsed.data,
      slug,
      body: content,
      readingTimeMinutes: readingTime(content),
    } satisfies Post;
  });

  return posts
    .filter((p) => !p.draft || process.env.NODE_ENV === "development")
    .sort((a, b) => b.published.localeCompare(a.published));
});

export const getPost = cache((slug: string): Post | undefined =>
  getAllPosts().find((p) => p.slug === slug),
);

/** Posts that document a given project, for cross-linking. */
export const getPostsForProject = cache((projectSlug: string): Post[] =>
  getAllPosts().filter((p) => p.project === projectSlug),
);
