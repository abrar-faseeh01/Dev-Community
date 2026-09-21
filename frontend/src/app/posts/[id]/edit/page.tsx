import { EditPostView } from "@/features/posts/components/edit-post-view";

export default async function EditPostPage({
  params,
}: PageProps<"/posts/[id]/edit">) {
  const { id } = await params;
  return <EditPostView id={id} />;
}
