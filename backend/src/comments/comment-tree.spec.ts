import { MAX_COMMENT_DEPTH } from './comment.constants';
import {
  attachmentPointFor,
  buildCommentTree,
  childAncestorIds,
  type CommentRow,
} from './comment-tree';

// Stand-in ObjectIds: 24 lowercase hex characters, ascending, so their
// string order is their creation order — the same property the real ids have
// and the same one buildCommentTree sorts on.
const oid = (n: number) => n.toString(16).padStart(24, '0');

const POST_ID = oid(0xa11);

function row(
  n: number,
  parent: number | null = null,
  overrides: Partial<CommentRow> = {},
): CommentRow {
  const createdAt = new Date(2026, 0, 1, 0, 0, n);
  return {
    id: oid(n),
    postId: POST_ID,
    parentCommentId: parent === null ? null : oid(parent),
    body: `comment ${n}`,
    createdAt,
    updatedAt: createdAt, // never edited, by default
    likeCount: 0,
    dislikeCount: 0,
    myReaction: null,
    author: { id: oid(900 + n), fullName: `Author ${n}` },
    ...overrides,
  };
}

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);

describe('attachmentPointFor', () => {
  it('attaches a comment at or above the maximum depth to its real parent', () => {
    expect(attachmentPointFor(1, 'parent', 'root', 2)).toBe('parent');
    expect(attachmentPointFor(2, 'parent', 'root', 2)).toBe('parent');
  });

  it('attaches a comment past the maximum depth to the root instead', () => {
    expect(attachmentPointFor(3, 'parent', 'root', 2)).toBe('root');
    expect(attachmentPointFor(50, 'parent', 'root', 2)).toBe('root');
  });

  it('generalises to any threshold, not just the one currently configured', () => {
    expect(attachmentPointFor(3, 'parent', 'root', 3)).toBe('parent');
    expect(attachmentPointFor(4, 'parent', 'root', 3)).toBe('root');
  });

  it('defaults to the real MAX_COMMENT_DEPTH when none is given', () => {
    expect(MAX_COMMENT_DEPTH).toBe(2);
    expect(attachmentPointFor(2, 'parent', 'root')).toBe('parent');
    expect(attachmentPointFor(3, 'parent', 'root')).toBe('root');
  });
});

describe('childAncestorIds', () => {
  it('builds a reply path as the parent path plus the parent itself', () => {
    expect(childAncestorIds(oid(2), [oid(1)])).toEqual([oid(1), oid(2)]);
  });

  it('gives a reply to a top-level comment a single-entry path', () => {
    expect(childAncestorIds(oid(1), [])).toEqual([oid(1)]);
  });

  it('does not mutate the parent path it was given', () => {
    const parentPath = [oid(1)];
    childAncestorIds(oid(2), parentPath);
    expect(parentPath).toEqual([oid(1)]);
  });
});

describe('buildCommentTree', () => {
  it('returns nothing for no comments', () => {
    expect(buildCommentTree([])).toEqual([]);
  });

  it('nests a comment at the maximum depth under its real parent', () => {
    const tree = buildCommentTree([row(1), row(2, 1)]);

    expect(ids(tree)).toEqual([oid(1)]);
    expect(ids(tree[0].replies)).toEqual([oid(2)]);
    expect(tree[0].replies[0].replies).toEqual([]);
  });

  it('flattens everything past the maximum depth under the depth-1 root', () => {
    // A (root) — B replies to A — C replies to B — D replies to C.
    const tree = buildCommentTree([row(1), row(2, 1), row(3, 2), row(4, 3)]);

    expect(ids(tree)).toEqual([oid(1)]);
    // B, C and D all land as direct siblings under A, in the order written —
    // not nested inside one another the way their real replies do.
    expect(ids(tree[0].replies)).toEqual([oid(2), oid(3), oid(4)]);
    // The point of flattening: nothing below the root ever nests two levels
    // deep in the response, however deep the real conversation runs.
    for (const reply of tree[0].replies) {
      expect(reply.replies).toEqual([]);
    }
  });

  it("keeps each flattened comment's true parentCommentId, not the root it renders under", () => {
    const tree = buildCommentTree([row(1), row(2, 1), row(3, 2), row(4, 3)]);

    const [, c, d] = tree[0].replies;
    expect(c.parentCommentId).toBe(oid(2)); // C really replies to B, not A
    expect(d.parentCommentId).toBe(oid(3)); // D really replies to C, not A
  });

  it('mixes every branch of a thread into one chronological list under the root', () => {
    // Two depth-2 replies to the same root, each with its own depth-3 reply,
    // interleaved by when they were written.
    const tree = buildCommentTree([
      row(1), // A, the root
      row(2, 1), // B1, replies to A
      row(3, 2), // C1, replies to B1
      row(4, 1), // B2, replies to A
      row(5, 4), // C2, replies to B2
    ]);

    // All four descendants land under the root together, purely by when
    // they were written — not grouped by which branch they came from.
    expect(ids(tree[0].replies)).toEqual([oid(2), oid(3), oid(4), oid(5)]);
  });

  it('orders roots newest first and replies oldest first', () => {
    const tree = buildCommentTree([row(1), row(2), row(3, 1), row(4, 1)]);

    expect(ids(tree)).toEqual([oid(2), oid(1)]);
    expect(ids(tree[1].replies)).toEqual([oid(3), oid(4)]);
  });

  it('orders the same way whatever order the rows arrive in', () => {
    const rows = [row(1), row(2), row(3, 1), row(4, 1)];
    const shuffled = [rows[2], rows[0], rows[3], rows[1]];

    const fromShuffled = buildCommentTree(shuffled);

    expect(ids(fromShuffled)).toEqual([oid(2), oid(1)]);
    expect(ids(fromShuffled[1].replies)).toEqual([oid(3), oid(4)]);
  });

  it('drops an orphan rather than promoting it to the top level', () => {
    // 5's parent (4) is not in the list — cascaded away by a concurrent
    // delete. The orphan must not appear anywhere.
    const tree = buildCommentTree([row(1), row(5, 4)]);

    expect(ids(tree)).toEqual([oid(1)]);
    expect(tree[0].replies).toEqual([]);
  });

  it('drops a whole orphaned subtree, not just its root', () => {
    // 5 is orphaned (parent 4 is missing) and 6 replies to 5.
    const tree = buildCommentTree([row(1), row(5, 4), row(6, 5)]);

    expect(ids(tree)).toEqual([oid(1)]);
    expect(JSON.stringify(tree)).not.toContain(oid(6));
  });

  it('drops an orphaned chain even several levels past the flatten point', () => {
    // 4 is missing; 5 replies to 4; 6 replies to 5; 7 replies to 6 — the
    // whole chain is unreachable however far past MAX_COMMENT_DEPTH it runs.
    const tree = buildCommentTree([row(1), row(5, 4), row(6, 5), row(7, 6)]);

    expect(ids(tree)).toEqual([oid(1)]);
    expect(tree[0].replies).toEqual([]);
  });

  it('keeps a live sibling when its sibling subtree is orphaned', () => {
    const tree = buildCommentTree([row(1), row(2, 1), row(5, 4)]);

    expect(ids(tree)).toEqual([oid(1)]);
    expect(ids(tree[0].replies)).toEqual([oid(2)]);
  });

  it('does not modify the rows it was given', () => {
    const rows = [row(2, 1), row(1)];
    const snapshot = JSON.parse(JSON.stringify(rows));

    buildCommentTree(rows);

    expect(JSON.parse(JSON.stringify(rows))).toEqual(snapshot);
    expect(rows[0]).not.toHaveProperty('replies');
  });

  it('copies only the fields the API returns, never extras on the input', () => {
    // A caller passing something closer to a raw document must not leak it.
    const withExtras = {
      ...row(1),
      ancestorIds: [oid(99)],
      deletedAt: null,
      __v: 0,
    } as CommentRow;

    const [node] = buildCommentTree([withExtras]);

    expect(Object.keys(node).sort()).toEqual([
      'author',
      'body',
      'createdAt',
      'dislikeCount',
      'id',
      'likeCount',
      'myReaction',
      'parentCommentId',
      'postId',
      'replies',
      'updatedAt',
    ]);
  });

  it("carries each comment's own myReaction and counters through to its node, replies included", () => {
    const [root] = buildCommentTree([
      row(1, null, { myReaction: 'like', likeCount: 3 }),
      row(2, 1, { myReaction: 'dislike', dislikeCount: 2 }),
      row(3, 1),
    ]);

    expect(root.myReaction).toBe('like');
    expect(root.likeCount).toBe(3);
    const [reply1, reply2] = root.replies;
    expect(reply1.myReaction).toBe('dislike');
    expect(reply1.dislikeCount).toBe(2);
    expect(reply2.myReaction).toBeNull();
  });

  it('carries the author through as given, including a deleted one', () => {
    const deletedAuthor = { id: null, fullName: 'Deleted user', headline: null };
    const [node] = buildCommentTree([
      row(1, null, { author: deletedAuthor }),
    ]);

    expect(node.author).toEqual(deletedAuthor);
  });
});
