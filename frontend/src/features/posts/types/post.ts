// Mirrors backend/src/posts/dto/post-response.dto.ts. Dates are ISO strings
// (Mongoose Date -> JSON), not Date objects, same as features/profile/types/profile.ts.

import type { AuthorSummary } from "@/types/author-summary";
import type { ReactionType } from "@/types/reaction";

// The populated author is narrowed server-side to exactly these fields —
// email and role are never returned. When the author's account has been
// deleted the API returns a placeholder of the same shape: id and headline
// null, fullName "Deleted user". Comments use the identical shape
// (@/types/author-summary), which is why this is now that shared type rather
// than its own copy.
export type PostAuthor = AuthorSummary;

export type Post = {
  id: string;
  title: string;
  body: string;
  // Denormalized counters, maintained by the backend (comments and
  // reactions). Typed so the contract is complete; the reaction counts are
  // not rendered yet.
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  // The signed-in caller's own reaction to this post. null when they have
  // none, are signed out, or (on a post they just created) cannot have one.
  myReaction: ReactionType | null;
  // Always null on anything the API returns from a read route — a
  // soft-deleted post 404s instead.
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
};

// GET /posts. nextCursor is the previous page's last post id (base64), and
// null means there is no next page. There are no page numbers or totals.
export type PostPage = {
  items: Post[];
  nextCursor: string | null;
};

// DELETE /posts/:id
export type DeletedPost = {
  id: string;
  deletedAt: string;
};
