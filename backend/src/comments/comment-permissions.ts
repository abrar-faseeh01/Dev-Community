import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '../common/authorization/owner-or-admin';

// Who may delete a comment. Comment-specific rather than the shared
// assertOwnerOrAdmin: that helper knows one owner only and words its 403 for
// editing ("You can only edit your own …"), while a comment can be deleted by
// three different people:
//
//   1. its author;
//   2. the author of the POST it sits on — they control the discussion under
//      their own post, and may remove anyone's comment there;
//   3. an admin, who moderates everywhere.
//
// Anyone else is refused, including the author of some other post. Editing is
// a separate, stricter check — see assertMayEditComment below.

// The two rules that need no lookup. Kept apart from the full check so the
// caller can skip the post query — the only extra read — whenever the
// requester is already allowed.
export function isCommentAuthorOrAdmin(
  requester: RequestUser,
  commentAuthorId: string,
): boolean {
  return requester.userId === commentAuthorId || requester.role === 'admin';
}

// `postAuthorId` is the author of the post the comment is on, or null when it
// was not looked up (the requester was already allowed) or the post is gone.
export function assertMayDeleteComment(
  requester: RequestUser,
  commentAuthorId: string,
  postAuthorId: string | null,
): void {
  if (isCommentAuthorOrAdmin(requester, commentAuthorId)) return;
  if (postAuthorId !== null && requester.userId === postAuthorId) return;

  throw new ForbiddenException(
    'You can only delete your own comments or comments on your own posts',
  );
}

// Editing is stricter than deleting: the comment's own author, full stop.
// No admin override and no post-owner override — moderating someone else's
// comment (by deleting it) is one thing, rewriting its words is another, and
// nobody but its author may do that.
export function assertMayEditComment(
  requester: RequestUser,
  commentAuthorId: string,
): void {
  if (requester.userId !== commentAuthorId) {
    throw new ForbiddenException('You can only edit your own comments');
  }
}
