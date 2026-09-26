import type { Types } from 'mongoose';
import {
  toAuthorSummary,
  type AuthorSummary,
  type PopulatedAuthor,
} from '../users/author-summary';
import type { ReactionType } from './schemas/reaction.schema';

// A reaction row after .populate('userId', 'fullName headline'), which swaps
// the ObjectId for the small user object (or null, when the account has since
// been deleted — reaction rows are not removed with the account). Declared
// here for the same reason PopulatedComment is: Mongoose's typing does not
// narrow the field after populate.
export type PopulatedReaction = {
  _id: Types.ObjectId;
  type: ReactionType;
  userId: PopulatedAuthor | null;
};

// One person in a "who reacted" list.
export type Reactor = {
  user: AuthorSummary;
  type: ReactionType;
};

// Hand-picked fields, so nothing else on User (email, role, anything added
// later) or on the reaction row can reach the response. A deleted account
// becomes the same "Deleted user" placeholder posts and comments use.
export function toReactor(row: PopulatedReaction): Reactor {
  return { user: toAuthorSummary(row.userId), type: row.type };
}
