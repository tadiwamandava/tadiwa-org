/**
 * Starting points for new entries.
 *
 * The rule: a freshly created entry must already satisfy the schema AND the
 * corpus invariants in `scripts/check-content.ts`, so `npm run check:content`
 * passes the moment the file exists. A "new" button that produces a file the
 * gate rejects is worse than no button — it puts the repo in a red state and
 * makes the owner debug a form instead of writing.
 *
 * That is why the placeholder text is long: `pitch` needs 20 characters,
 * `hardestThing` 40, and the body 120. Every one of these strings also
 * contains TODO on purpose, so the entry shows up immediately in the admin's
 * unfinished list and in check:content's placeholder warning.
 */

import type { EntryDraft, EntryKind } from "./store.ts";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Turns a typed title into a filename-safe slug. */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const PROJECT_BODY = `## What it is

TODO: one paragraph on what this project actually does, written for someone
who has never seen it. Lead with the thing that is hard about it.

## How it works

TODO: the architecture, and the one decision that shaped everything else.
`;

const POST_BODY = `TODO: the opening paragraph. State the claim the post is going to defend,
then spend the rest of the piece defending it with something specific.

## The first thing

TODO: replace this section.
`;

/**
 * `status: "building"` is deliberate: check-content requires a `finished` date
 * for "shipped" and forbids one otherwise, so "building" is the only status a
 * brand-new entry can hold without either lying or failing the gate.
 */
export function newDraft(kind: EntryKind, title: string): EntryDraft {
  if (kind === "project") {
    return {
      frontmatter: {
        title,
        pitch: "TODO: one sentence — what this is, and the hardest thing about it.",
        status: "building",
        started: today(),
        domains: ["systems"],
        languages: ["TODO"],
        hardestThing:
          "TODO: two or three sentences framing the difficulty. Not what it does — " +
          "what made it hard, and what you had to learn to get past it.",
      },
      body: PROJECT_BODY,
    };
  }

  return {
    frontmatter: {
      title,
      description: "TODO: 20–300 characters. This is the meta description and the OG card.",
      published: today(),
      draft: true,
    },
    body: POST_BODY,
  };
}
