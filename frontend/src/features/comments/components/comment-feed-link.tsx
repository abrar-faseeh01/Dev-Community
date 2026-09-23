import { commentFocusUrl } from "@/features/comments/utils/comment-focus";
import Link from "next/link";

type CommentFeedLinkProps = {
  postId: string;
  commentCount: number;
};

function CommentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

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
      className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 rounded"
    >
      <CommentIcon />
      <span>{commentCount} Comments</span>
    </Link>
  );
}
