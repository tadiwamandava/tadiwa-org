import { notFound } from "next/navigation";

import { assertFieldCoverage, POST_FIELDS, PROJECT_FIELDS } from "@/lib/admin/fields";
import { assertAdminAccess } from "@/lib/admin/guard";
import { contentStore } from "@/lib/admin/store-fs";
import type { EntryKind } from "@/lib/admin/store";
import { EntryEditor } from "./entry-editor";

/**
 * The server half of the editor, shared by /admin/projects/[slug] and
 * /admin/writing/[slug]. Reads the entry through the store, hands the derived
 * field tree and the raw frontmatter to the client form.
 *
 * The frontmatter passed down is what YAML actually contains, NOT the
 * schema-parsed version. Handing over defaulted values would make the editor
 * write `featured: false` into files that never mentioned it, turning every
 * first save into a large diff of things the owner did not change.
 */
export async function AdminEditorPage({ kind, slug }: { kind: EntryKind; slug: string }) {
  await assertAdminAccess();
  // Fails loudly if a schema field has no control, or a presentation hint
  // names a field that no longer exists. Cheap, and it runs every time the
  // editor is opened.
  assertFieldCoverage();

  const entry = await contentStore.read(kind, slug);
  if (!entry) notFound();

  return (
    <EntryEditor
      kind={kind}
      slug={entry.slug}
      path={entry.path}
      publicHref={kind === "project" ? `/projects/${entry.slug}` : `/writing/${entry.slug}`}
      fields={kind === "project" ? PROJECT_FIELDS : POST_FIELDS}
      initialFrontmatter={entry.frontmatter}
      initialBody={entry.body}
      comments={entry.comments}
      placeholders={entry.placeholders}
      initialIssues={entry.issues}
    />
  );
}
