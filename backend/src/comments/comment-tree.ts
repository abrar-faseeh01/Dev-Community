import type { ReactionType } from '../reactions/schemas/reaction.schema';
import type { AuthorSummary } from '../users/author-summary';
import { MAX_COMMENT_DEPTH } from './comment.constants';

// Pure functions only — no Nest, no Mongoose, no database. Everything here
// is decided from its arguments alone, so it can be unit-tested directly and
// the service is left with nothing but I/O.

// ---------------------------------------------------------------------------
// Ancestry
// ---------------------------------------------------------------------------

// The ancestorIds a reply to this parent must store: the parent's own
// ancestors, then the parent itself. Generic over the id type so this file
// stays free of Mongoose — the service passes ObjectIds, the tests strings.
export function childAncestorIds<T>(
  parentId: T,
  parentAncestorIds: readonly T[],
): T[] {
  return [...parentAncestorIds, parentId];
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

// One live comment, already narrowed to what the API returns. ancestorIds
// and deletedAt are deliberately absent: they are internal bookkeeping, and
// leaving them off the type means they cannot reach a response by accident.
export type CommentRow = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  body: string;
  createdAt: Date;
  // Equal to createdAt until the comment is edited. A client compares the
  // two to show an "Edited" label — the value itself is never displayed.
  updatedAt: Date;
  likeCount: number;
  dislikeCount: number;
  // The caller's own reaction. Not stored on the comment: toCommentRow leaves
  // it null and the list route fills it in for the signed-in caller (one
  // batched lookup) before the tree is built, so this file stays pure.
  myReaction: ReactionType | null;
  author: AuthorSummary;
};

export type CommentNode = CommentRow & { replies: CommentNode[] };

// Hand-picked fields, never a spread of the input — the same rule as
// PostsController.toPostResponse. If a caller ever passes a raw document,
// nothing extra on it can ride along into the response. Exported because a
// comment that was just created is a node with no replies yet, and the create
// route returns it in exactly the shape the list does.
export function toCommentNode(row: CommentRow): CommentNode {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    likeCount: row.likeCount,
    dislikeCount: row.dislikeCount,
    myReaction: row.myReaction,
    author: row.author,
    replies: [],
  };
}

// Decides which existing node a comment attaches under, given its own real
// depth (1 = top level, counting up from there), the id of its literal
// parent, and the id of its depth-1 root (the two are the same id when the
// comment is itself a direct reply to the root). A comment at maxDepth or
// shallower nests under its real parent, exactly like a literal reply.
// Anything deeper attaches under the depth-1 root instead — this is what
// keeps the returned tree from ever nesting past maxDepth levels, however
// long the real conversation runs. maxDepth defaults to the configured
// MAX_COMMENT_DEPTH but takes an explicit value too, so the rule itself can
// be tested independently of whatever that constant happens to be.
export function attachmentPointFor(
  depth: number,
  parentId: string,
  rootId: string,
  maxDepth: number = MAX_COMMENT_DEPTH,
): string {
  return depth <= maxDepth ? parentId : rootId;
}

// One comment's place in the thread, resolved by walking its parentCommentId
// chain through the rows actually handed to buildCommentTree — not through
// stored ancestorIds, which this module never reads. `null` means the chain
// broke before reaching a root: the comment (or something above it) has a
// parent that is not present, i.e. it is an orphan whose parent was cascaded
// away by a concurrent delete. depth and rootId are 1-indexed and resolved
// together in one walk, memoized so a wide thread costs one pass rather than
// one walk per comment.
type Ancestry = { depth: number; rootId: string };

function resolveAncestry(
  id: string,
  byId: ReadonlyMap<string, CommentNode>,
  memo: Map<string, Ancestry | null>,
): Ancestry | null {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;

  const node = byId.get(id);
  if (!node) {
    memo.set(id, null);
    return null;
  }

  let result: Ancestry | null;
  if (node.parentCommentId === null) {
    result = { depth: 1, rootId: id };
  } else {
    const parent = resolveAncestry(node.parentCommentId, byId, memo);
    result =
      parent === null ? null : { depth: parent.depth + 1, rootId: parent.rootId };
  }
  memo.set(id, result);
  return result;
}

// Turns one post's live comments into the nested tree the API returns.
//
// Ordering is decided here, not by the caller's query: rows are sorted by id
// ascending first (an ObjectId's leading bytes are a timestamp, and the hex
// is fixed-length lowercase, so string order is creation order). Every
// comment is then attached in that order — oldest first, which reads as a
// conversation — and the roots are reversed at the end, so the newest
// discussion is at the top, matching the posts feed.
//
// Nesting stops at MAX_COMMENT_DEPTH (attachmentPointFor decides this per
// comment): a root's `replies` holds every comment in its thread, however
// deep the real reply chain runs, as direct siblings in the order they were
// written, each still carrying its own true `parentCommentId`. For the
// currently configured MAX_COMMENT_DEPTH (2), this means only a root's own
// `replies` is ever non-empty — a depth-2 comment's real children are depth
// 3, which redirect to the root instead of nesting inside it.
//
// A comment attaches only when its full chain up to a root is present in
// `rows`. There is deliberately NO fallback that promotes a comment whose
// chain is broken to the top level: such a comment is an orphan, and showing
// a reply out of its context would be worse than not showing it. Its own
// replies become unreachable with it, so the whole orphaned subtree drops
// out together, however deep it runs.
export function buildCommentTree(rows: readonly CommentRow[]): CommentNode[] {
  const ordered = [...rows].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const byId = new Map<string, CommentNode>();
  for (const row of ordered) {
    byId.set(row.id, toCommentNode(row));
  }

  const ancestryMemo = new Map<string, Ancestry | null>();
  const roots: CommentNode[] = [];

  for (const row of ordered) {
    // Non-null: every ordered row was just put in the map above.
    const node = byId.get(row.id)!;

    if (row.parentCommentId === null) {
      roots.push(node);
      continue;
    }

    const ancestry = resolveAncestry(row.id, byId, ancestryMemo);
    if (!ancestry) continue; // orphan — dropped, never promoted. See above.

    const attachToId = attachmentPointFor(
      ancestry.depth,
      row.parentCommentId,
      ancestry.rootId,
    );
    // Non-null: resolveAncestry only returns a result when every ancestor up
    // to and including this row is present in byId, which covers attachToId
    // — it is either the row's own parent or its root, both reached getting
    // that result.
    byId.get(attachToId)!.replies.push(node);
  }

  return roots.reverse();
}
