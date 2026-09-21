// Mirrors backend/src/posts/dto/post-response.dto.ts. Dates are ISO strings
// (Mongoose Date -> JSON), not Date objects, same as lib/types/profile.ts.

// The populated author is narrowed server-side to exactly these fields —
// email and role are never returned.
export type PostAuthor = {
  id: string;
  fullName: string;
  headline?: string;
};

export type Post = {
  id: string;
  title: string;
  body: string;
  // Denormalized counters, always 0 until Day 9 (comments) and Day 11
  // (reactions) start maintaining them. Typed so the contract is complete,
  // but not rendered yet.
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
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
