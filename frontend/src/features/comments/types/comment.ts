// Mirrors backend/src/comments/dto/comment-response.dto.ts (CommentDto).
// Dates are ISO strings (Mongoose Date -> JSON), same convention as
// features/posts/types/post.ts. ancestorIds, deletedAt and __v are never
// returned by the API and so have no place here.

import type { AuthorSummary } from "@/types/author-summary";

export type Comment = {
  id: string;
  postId: string;
  // null for a top-level comment; otherwise the id of the comment this one
  // replies to. This is the comment's TRUE parent — it can differ from where
  // the node actually sits in `replies` once depth exceeds MAX_COMMENT_DEPTH
  // (2) on the backend: a reply deeper than that still attaches under its
  // depth-1 root's `replies`, flattened, but keeps its real parentCommentId
  // so a client can still show "replying to @author".
  parentCommentId: string | null;
  body: string;
  createdAt: string;
  // Equal to createdAt until the comment is edited — compare the two to show
  // an "(edited)" label. The value itself is never meant to be displayed.
  updatedAt: string;
  author: AuthorSummary;
  // This comment's full reply thread, oldest first. In practice only ever
  // non-empty on a root (depth-1) comment — see the parentCommentId note.
  replies: Comment[];
};

// GET posts/:postId/comments — a bare array of root nodes, newest first.
export type CommentTree = Comment[];

// POST posts/:postId/comments
export type CreatedComment = Comment;

// PATCH comments/:id. Deliberately not the full Comment: an edit never
// changes replies, so returning replies: [] here would misrepresent a
// comment that already has some.
export type EditedComment = {
  id: string;
  body: string;
  updatedAt: string;
};

// DELETE comments/:id
export type DeletedComment = {
  id: string;
  deletedAt: string;
  // How many comments this call deleted: the target plus every reply
  // beneath it (the cascade).
  deletedCount: number;
};
