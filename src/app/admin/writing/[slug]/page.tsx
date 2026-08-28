import { AdminEditorPage } from "@/components/admin/editor-page";

export const dynamic = "force-dynamic";

export default async function AdminPostEditor(props: PageProps<"/admin/writing/[slug]">) {
  const { slug } = await props.params;
  return <AdminEditorPage kind="post" slug={slug} />;
}
