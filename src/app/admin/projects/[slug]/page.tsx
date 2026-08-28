import { AdminEditorPage } from "@/components/admin/editor-page";

/**
 * Deliberately no `generateStaticParams`: the admin is never prerendered. In a
 * production build the layout 404s before this runs, and in dev the file on
 * disk is the source of truth on every request.
 */
export const dynamic = "force-dynamic";

export default async function AdminProjectEditor(
  props: PageProps<"/admin/projects/[slug]">,
) {
  const { slug } = await props.params;
  return <AdminEditorPage kind="project" slug={slug} />;
}
