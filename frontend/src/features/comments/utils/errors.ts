import { ApiError } from "@/lib/axios/api-error";

// A handful of backend messages are accurate but written for a database
// record, not a reader — "Parent comment not found" is true (the row is
// gone) but reads like an internal error rather than telling the reader what
// actually happened (the comment they replied to was deleted, most likely by
// its author or a moderator, in the moment between opening the reply form and
// submitting it). Each of these is reachable only through a genuine race
// (the post/comment/parent was deleted by someone else after this reader's
// page loaded but before their request landed) — verified against the exact
// strings backend/src/comments/comments.service.ts and comment-permissions.ts
// throw (see the reference comment on splitCommentFormErrors below). Keyed by
// the raw message text, not status code, since a 404 alone doesn't say which
// of "Post not found" / "Comment not found" / "Parent comment not found" it
// was, and each needs its own reply-context wording.
const FRIENDLY_MESSAGES = new Map<string, string>([
  ["Post not found", "This post is no longer available."],
  ["Comment not found", "This comment has been deleted."],
  [
    "Parent comment not found",
    "The comment you're replying to has been deleted.",
  ],
  [
    "The parent comment belongs to a different post",
    "Something went wrong loading this comment. Refresh the page and try again.",
  ],
]);

// No response at all (server down, offline) reaches a caller as an ApiError
// with no status and the generic message "Request failed" — not something to
// show a reader. Anything the server did answer already carries its own
// message, remapped through FRIENDLY_MESSAGES when it's one of the known
// technical-sounding ones above. Mirrors features/posts/utils/errors.ts's
// describeSaveError, plus the remap.
export function describeSaveError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === undefined) {
    return "Couldn't reach the server, so nothing was saved. Check your connection and try again.";
  }
  if (error instanceof Error) {
    return FRIENDLY_MESSAGES.get(error.message) ?? error.message;
  }
  return fallback;
}

// POST posts/:postId/comments and PATCH comments/:id answer 404 for a post
// or comment that doesn't exist or was soft-deleted — verified live against
// the real backend (2026-09-23): a malformed :postId/:id/parentCommentId is
// a 400 with a plain top-level message and an empty `errors` array (e.g.
// `"not-a-valid-id" is not a valid id`), same for "Post not found",
// "Parent comment not found" and "The parent comment belongs to a different
// post" — none of these carry a field-matchable `errors` entry, so they
// belong in the banner, not on the body field — where describeSaveError's
// FRIENDLY_MESSAGES remap turns the three 404 strings into reader-facing
// wording (the 400 case is defensive: the client always sends a
// parentCommentId that belongs to the current post, so it isn't reachable
// through the UI, but is mapped anyway in case that ever changes).
export function hasStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

export type CommentFormErrors = {
  // A server validation message that concerns the body, keyed so it can sit
  // under the textarea. There is only one field to match, unlike posts'
  // title/body split — parentCommentId is never user-typed, so a
  // "parentCommentId must be a mongodb id" message (confirmed live) has
  // nowhere field-level to go and falls through to the banner too.
  fields: { body?: string };
  banner: string | null;
};

// Sorts a failed create/edit into a per-field message and a banner.
// class-validator messages start with the property name ("body should not
// be empty"), which is how they're matched to the field — confirmed live:
// a blank/whitespace body, an over-2000-char body, and a missing body all
// come back with one or more "body ..." entries in `errors`; a truly missing
// body sends three ("body must be shorter than or equal to 2000 characters",
// "body should not be empty", "body must be a string") — the first is kept,
// same "first message wins" rule splitPostFormErrors already uses.
export function splitCommentFormErrors(
  error: unknown,
  fallback: string,
): CommentFormErrors {
  const fields: CommentFormErrors["fields"] = {};
  const rest: string[] = [];

  if (error instanceof ApiError && error.errors.length > 0) {
    for (const message of error.errors) {
      if (message.startsWith("body") && !fields.body) fields.body = message;
      else rest.push(message);
    }
    return { fields, banner: rest.length > 0 ? rest.join(" ") : null };
  }

  return { fields, banner: describeSaveError(error, fallback) };
}
