// The one place that decides what a viewer may do to a comment in the UI —
// mirrors features/posts/utils/permissions.ts's getPostActor. The backend's
// checks (comment-permissions.ts's assertMayDeleteComment/
// assertMayEditComment) are the real security boundary; this only decides
// what to offer, and a server 403 is still handled separately.

// "author"     — the comment's own author. Gets Edit and Delete. Checked
//                before role, matching assertMayEditComment's own check
//                (ownership only, no role gate) — someone who authored a
//                comment while a `user` and was later promoted to admin can
//                still edit that exact comment.
// "admin"      — an admin who isn't the comment's author. Gets Delete only,
//                never Edit (assertMayEditComment has no admin override).
// "post-owner" — the author of the post the comment is on, but neither the
//                comment's author nor an admin. Gets Delete only.
// `author`, `admin` and `post-owner` are not fully disjoint: a user
// commenting on their own post is both `author` and `post-owner` at once —
// `author` is checked first and wins. `admin` is disjoint from both: an
// admin can never author a post or a comment (both creation routes are
// @Roles('user')), so it's never also `author` or `post-owner`.
export type CommentActor = "author" | "admin" | "post-owner" | null;

type Viewer = { id: string; role: "admin" | "user" } | null;

export function getCommentActor(
  viewer: Viewer,
  // A deleted author has a null id, which never equals a viewer's id.
  comment: { author: { id: string | null } },
  postAuthorId: string | null,
): CommentActor {
  if (!viewer) return null;
  if (viewer.id === comment.author.id) return "author";
  if (viewer.role === "admin") return "admin";
  if (viewer.id === postAuthorId) return "post-owner";
  return null;
}

// Whether the viewer may create a comment or a reply — gates the composer
// and every Reply button. A pure 3-way check on Viewer (user / admin /
// null): it does not and cannot distinguish "logged out" from "auth still
// loading" (useAuth() returns user: null in both cases) — that distinction
// is a separate, caller-owned check (useAuth().loading), the same way
// create-post-view.tsx keeps `loading` apart from `user`.
export function canComment(viewer: Viewer): boolean {
  return viewer !== null && viewer.role === "user";
}
