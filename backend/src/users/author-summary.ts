import type { Types } from 'mongoose';

// The shape .populate('authorId', 'fullName headline') actually produces at
// runtime — overrides Post.authorId's declared Types.ObjectId type for
// callers that know they populated it. Populate yields null when the user
// has since been hard-deleted (UsersService.deleteUser), so every consumer
// has to be ready for that.
export type PopulatedAuthor = {
  _id: Types.ObjectId;
  fullName: string;
  headline?: string;
};

export type AuthorSummary = {
  id: string | null;
  fullName: string;
  headline?: string | null;
};

export const DELETED_AUTHOR_NAME = 'Deleted user';

// The author as the API returns it, for posts and comments alike: exactly
// {id, fullName, headline}, so nothing else on User (email, role, anything
// added later) can leak through by accident. A deleted account gets a
// placeholder of the same shape instead of null, so a client can render the
// row without a null check.
export function toAuthorSummary(
  author: PopulatedAuthor | null | undefined,
): AuthorSummary {
  if (!author) {
    return { id: null, fullName: DELETED_AUTHOR_NAME, headline: null };
  }
  return {
    id: String(author._id),
    fullName: author.fullName,
    headline: author.headline,
  };
}

// The target passed to recordAdminOverride. The id is the raw authorId
// captured before populating (it survives the account being deleted); the
// name falls back to the placeholder, and `exists: false` tells the helper
// there is nobody to notify.
export function toOverrideTarget(
  authorId: string,
  author: PopulatedAuthor | null | undefined,
) {
  return {
    id: authorId,
    fullName: author?.fullName ?? DELETED_AUTHOR_NAME,
    exists: Boolean(author),
  };
}
