import type { Post } from "@/features/posts/types/post";
import { postKeys } from "@/features/posts/queries/post-queries";
import type { QueryClient } from "@tanstack/react-query";
import type { Comment, CommentTree } from "../types/comment";
import { commentKeys } from "../queries/comment-queries";

// Structural changes (a create/reply's new node, a delete's cascade removal)
// are not handled here — they go through invalidate + refetch instead (see
// the plan's "Cache strategy"), because MAX_COMMENT_DEPTH's flattening rule
// means a client-side tree patch would have to reimplement the server's own
// depth/attach logic to stay correct. This file only ever does two things:
// adjust a post's cached commentCount by a known delta, and patch an edited
// comment's body in place (no structural change, so no refetch needed).

// After a create (+1) or a cascade delete (-deletedCount). Clamped at 0,
// mirroring the backend's own clamp on Post.commentCount — defensive only;
// a correctly-synced cache never needs it.
export function adjustPostCommentCount(
  queryClient: QueryClient,
  postId: string,
  delta: number,
) {
  queryClient.setQueryData<Post>(postKeys.detail(postId), (post) =>
    post ? { ...post, commentCount: Math.max(0, post.commentCount + delta) } : post,
  );
}

// Finds `id` anywhere in the cached tree (a root, or flattened into some
// root's replies) and returns a tree with just that node's body/updatedAt
// replaced. Returns the original array reference when nothing matched, so a
// caller can tell "not found" apart from "found, unchanged" if it needs to.
function replaceCommentBody(
  nodes: Comment[],
  id: string,
  body: string,
  updatedAt: string,
): Comment[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === id) {
      changed = true;
      return { ...node, body, updatedAt };
    }
    if (node.replies.length > 0) {
      const nextReplies = replaceCommentBody(node.replies, id, body, updatedAt);
      if (nextReplies !== node.replies) {
        changed = true;
        return { ...node, replies: nextReplies };
      }
    }
    return node;
  });
  return changed ? next : nodes;
}

// After a successful edit (PATCH comments/:id). No refetch: the edit can't
// change where the comment sits in the tree, only its own body/updatedAt.
export function patchCommentBody(
  queryClient: QueryClient,
  postId: string,
  commentId: string,
  body: string,
  updatedAt: string,
) {
  queryClient.setQueryData<CommentTree>(commentKeys.list(postId), (tree) =>
    tree ? replaceCommentBody(tree, commentId, body, updatedAt) : tree,
  );
}
