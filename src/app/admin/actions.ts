"use server";

/**
 * Every write the admin can perform.
 *
 * SECURITY. A `"use server"` export is an HTTP endpoint. It is reachable by
 * anyone who can POST to this origin, whether or not any UI renders a button,
 * and whether or not the page that would call it is even routable. So the
 * first statement of every function here is `assertAdminEnabled()`, before
 * any input is read, and the filesystem driver asserts again underneath. See
 * `src/lib/admin/guard.ts` for the three layers and why there is no login.
 *
 * INPUT. Payloads arrive from a browser and are treated as hostile: the
 * envelope is parsed with Zod, the slug must match a narrow pattern before it
 * is allowed anywhere near a path, and the frontmatter is validated against
 * the real corpus schema by the writer before a byte is written.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type {
  CreatePayload,
  CreateResult,
  RebuildState,
  SavePayload,
  SaveResult,
} from "@/lib/admin/action-types";
import { newDraft, slugify } from "@/lib/admin/defaults";
import { assertAdminEnabled } from "@/lib/admin/guard";
import { rebuildSearchIndex } from "@/lib/admin/search-index";
import { ContentValidationError, normaliseStringsDeep } from "@/lib/admin/serialize";
import { contentStore } from "@/lib/admin/store-fs";
import { ENTRY_KINDS, SLUG_PATTERN } from "@/lib/admin/store";

const savePayloadSchema = z.object({
  kind: z.enum(ENTRY_KINDS),
  slug: z.string().regex(SLUG_PATTERN).max(80),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().max(500_000),
});

const createPayloadSchema = z.object({
  kind: z.enum(ENTRY_KINDS),
  title: z.string().trim().min(1).max(200),
});

/** Public routes read the corpus at render time, so a save invalidates all of them. */
function revalidateSite(): void {
  revalidatePath("/", "layout");
}

export async function saveEntryAction(
  _previous: SaveResult | null,
  payload: SavePayload,
): Promise<SaveResult> {
  assertAdminEnabled();
  const savedAt = Date.now();

  const parsed = savePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      savedAt,
      message: "The editor sent something this route does not accept.",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.map(String).join("."),
        message: i.message,
      })),
    };
  }

  const { kind, slug } = parsed.data;
  const frontmatter = normaliseStringsDeep(parsed.data.frontmatter) as Record<string, unknown>;
  const body = normaliseStringsDeep(parsed.data.body) as string;

  const existing = await contentStore.read(kind, slug);
  if (!existing) {
    return { ok: false, savedAt, message: `No such entry: ${kind}/${slug}`, issues: [] };
  }

  try {
    await contentStore.write(kind, slug, { frontmatter, body });
  } catch (err) {
    if (err instanceof ContentValidationError) {
      return {
        ok: false,
        savedAt,
        message: `${err.issues.length} field(s) need fixing, nothing was written.`,
        issues: err.issues,
      };
    }
    return { ok: false, savedAt, message: (err as Error).message, issues: [] };
  }

  revalidateSite();

  const warnings: string[] = [];
  if (existing.comments.length > 0) {
    warnings.push(
      `${existing.comments.length} YAML comment line(s) in the frontmatter were not preserved, ` +
        `frontmatter round-trips through data, and comments are not data.`,
    );
  }

  return { ok: true, savedAt, path: existing.path, warnings };
}

export async function createEntryAction(
  _previous: CreateResult | null,
  payload: CreatePayload,
): Promise<CreateResult> {
  assertAdminEnabled();

  const parsed = createPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Give the entry a title." };

  const { kind, title } = parsed.data;
  const slug = slugify(title);
  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, message: `"${title}" does not reduce to a usable slug.` };
  }
  if (await contentStore.exists(kind, slug)) {
    return { ok: false, message: `content/${slug}.mdx already exists, pick another title.` };
  }

  try {
    await contentStore.create(kind, slug, newDraft(kind, title));
  } catch (err) {
    if (err instanceof ContentValidationError) {
      // Means `newDraft` no longer satisfies the schema, a bug here, not in
      // the owner's input, and worth saying so out loud.
      return {
        ok: false,
        message:
          "The default template no longer satisfies the schema: " +
          err.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
      };
    }
    return { ok: false, message: (err as Error).message };
  }

  revalidateSite();
  // Throws, so nothing below runs and the return type stays honest.
  redirect(kind === "project" ? `/admin/projects/${slug}` : `/admin/writing/${slug}`);
}

// useActionState always passes the previous state as the first argument, so
// the signature has to accept it even though a rebuild does not depend on what
// came before. The disable must sit immediately above the parameter, a
// multi-line comment in between silently makes the directive apply to the
// wrong line, which eslint then reports as an unused directive.
export async function rebuildSearchAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _previous: RebuildState | null,
): Promise<RebuildState> {
  assertAdminEnabled();
  const result = await rebuildSearchIndex();
  revalidatePath("/admin");
  return {
    phase: "done",
    ok: result.ok,
    output: result.output,
    durationMs: result.durationMs,
    finishedAt: Date.now(),
  };
}
