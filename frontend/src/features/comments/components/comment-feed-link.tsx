import { commentFocusUrl } from "@/features/comments/utils/comment-focus";
import Link from "next/link";

type CommentFeedLinkProps = {
  postId: string;
  commentCount: number;
};

// The feed card's "go comment on this" entry point — reaction's button
// joins it in the same footer slot once Day 11 adds it. Always the same
// href regardless of the viewer's auth state: branching on "will they see a
// composer, or need to sign in first" happens once on the post page itself
// (comment-focus-handler.tsx), the same place that already makes that call
// for everything else on that page — not duplicated here, and not something
// this link can answer correctly while auth is still loading anyway.
export function CommentFeedLink({ postId, commentCount }: CommentFeedLinkProps) {
  return (
    <Link
      href={commentFocusUrl(postId)}
      className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
    >
      Comments ({commentCount})
    </Link>
  );
}
