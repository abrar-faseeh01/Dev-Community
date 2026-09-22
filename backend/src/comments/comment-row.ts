import type { Types } from 'mongoose';
import { toAuthorSummary, type PopulatedAuthor } from '../users/author-summary';
import type { CommentRow } from './comment-tree';

// A comment document after .populate('authorId', 'fullName headline'), which
// swaps the ObjectId for the small author object (or null, when the account
// has since been deleted). Declared here rather than derived from the schema
// because Mongoose's own typing does not narrow authorId after populate — the
// same reason PostWithAuthor exists for posts.
export type PopulatedComment = {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  parentCommentId: Types.ObjectId | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: PopulatedAuthor | null;
};

// The one place a stored comment becomes an API row. The create route and the
// list route both go through it, so a comment looks the same whichever way it
// reaches the client. Hand-picked fields, so ancestorIds, deletedAt and __v
// cannot leak.
export function toCommentRow(comment: PopulatedComment): CommentRow {
  return {
    id: String(comment._id),
    postId: String(comment.postId),
    parentCommentId:
      comment.parentCommentId === null ? null : String(comment.parentCommentId),
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: toAuthorSummary(comment.authorId),
  };
}
