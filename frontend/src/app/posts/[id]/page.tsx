import { PostPageView } from "@/features/posts/components/post-page-view";

export default async function PostPage({ params }: PageProps<"/posts/[id]">) {
  const { id } = await params;
  return <PostPageView id={id} />;
}
