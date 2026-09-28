import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { computeRankScore } from '../src/posts/ranking';
import { createE2eApp, describeE2e } from './helpers/e2e-app';
import { E2eData, type E2eUser } from './helpers/e2e-data';

// DB-backed order + pagination-stability + parity-with-computeRankScore for
// Day 13's sort=top and sort=discussed, plus the cursor-validation rules
// that keep a cursor from one sort from being replayed against another.
//
// Fixtures are created directly against the Post model (not through the
// create-post API) so likeCount/dislikeCount/commentCount can be set to
// exact, controlled values — including a deliberately negative likeCount,
// which the API itself has no way to produce.
describeE2e('sort=top and sort=discussed feeds', () => {
  let app: INestApplication;
  let data: E2eData;
  let author: E2eUser;
  let emptyAuthor: E2eUser;

  // Keyed by a short label so assertions can read naturally (order[0] is
  // 'commentHeavy', not a bare id).
  const fixture: Record<
    string,
    {
      id: string;
      likeCount: number;
      dislikeCount: number;
      commentCount: number;
    }
  > = {};

  beforeAll(async () => {
    app = await createE2eApp();
    data = new E2eData(app);
    await data.sweepLeftovers();

    author = await data.createUser('user');
    emptyAuthor = await data.createUser('user'); // owns zero posts on purpose

    const specs: Array<
      [
        string,
        { likeCount: number; dislikeCount: number; commentCount: number },
      ]
    > = [
      ['zeroEngagement', { likeCount: 0, dislikeCount: 0, commentCount: 0 }],
      ['smallUnanimous', { likeCount: 10, dislikeCount: 0, commentCount: 1 }],
      [
        'largeMostlyApproved',
        { likeCount: 500, dislikeCount: 50, commentCount: 2 },
      ],
      [
        'moreDislikesThanLikes',
        { likeCount: 5, dislikeCount: 20, commentCount: 3 },
      ],
      // Same stats as driftedNegative except likeCount is explicitly 0 —
      // the parity/negative-counter assertions below compare these two.
      ['flooredEquivalent', { likeCount: 0, dislikeCount: 2, commentCount: 5 }],
      ['driftedNegative', { likeCount: -3, dislikeCount: 2, commentCount: 5 }],
      // Identical counters — exercises the _id tie-breaker.
      ['tieA', { likeCount: 7, dislikeCount: 2, commentCount: 3 }],
      ['tieB', { likeCount: 7, dislikeCount: 2, commentCount: 3 }],
      [
        'commentHeavyZeroVotes',
        { likeCount: 0, dislikeCount: 0, commentCount: 15 },
      ],
    ];

    // Sequential creation, not Promise.all — _id ordering (and therefore the
    // _id-desc tie-breaker) has to be deterministic and match array order.
    for (const [label, counts] of specs) {
      const doc = await data.models.post.create({
        authorId: author.id,
        title: `[ranking-e2e] ${label}`,
        body: 'fixture',
        ...counts,
      });
      const id = String(doc._id);
      data.trackPost(id);
      fixture[label] = { id, ...counts };
    }
  });

  afterAll(async () => {
    try {
      await data?.cleanup();
    } finally {
      await app?.close();
    }
  });

  const http = () => request(app.getHttpServer());

  async function fetchPage(query: Record<string, string | number>) {
    const res = await http().get('/posts').query(query).expect(200);
    return res.body.data as {
      items: { id: string }[];
      nextCursor: string | null;
    };
  }

  async function fetchAllIds(
    sort: 'discussed' | 'top' | 'latest',
    authorId: string,
    pageSize = 1,
  ) {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 50; guard++) {
      const page = await fetchPage({
        sort,
        authorId,
        limit: pageSize,
        ...(cursor ? { cursor } : {}),
      });
      ids.push(...page.items.map((p) => p.id));
      if (!page.nextCursor) return ids;
      cursor = page.nextCursor;
    }
    throw new Error('fetchAllIds did not terminate — possible pagination bug');
  }

  describe('sort=discussed', () => {
    it('orders by commentCount desc, with _id desc breaking ties', async () => {
      const ids = await fetchAllIds('discussed', author.id, 20);

      // line ~128, was: [...Object.values(fixture)]
      const expected = Object.values(fixture)
        .sort(
          (a, b) => b.commentCount - a.commentCount || (a.id < b.id ? 1 : -1),
        )
        .map((f) => f.id);

      expect(ids).toEqual(expected);
    });

    it('paginates with no duplicates or skips across pages of size 1', async () => {
      const wholePage = await fetchAllIds('discussed', author.id, 20);
      const pagedOneAtATime = await fetchAllIds('discussed', author.id, 1);

      expect(pagedOneAtATime).toEqual(wholePage);
      expect(new Set(pagedOneAtATime).size).toBe(pagedOneAtATime.length); // no duplicates
    });
  });

  describe('sort=top', () => {
    // The DB-returned order must match computeRankScore's order, computed
    // independently in this test from the same raw counters — this is what
    // actually catches drift between ranking.ts and the aggregation, not
    // trusting they match by construction (CP4's own review already
    // verified the arithmetic matches exactly for 9 cases; this test
    // verifies the thing that actually matters for the feature: ordering).
    it('matches the order computeRankScore produces for the same fixtures', async () => {
      const ids = await fetchAllIds('top', author.id, 20);

      // line ~156, was: [...Object.values(fixture)]
      const expected = Object.values(fixture)
        .map((f) => ({ id: f.id, score: computeRankScore(f) }))
        .sort((a, b) => b.score - a.score || (a.id < b.id ? 1 : -1))
        .map((f) => f.id);

      expect(ids).toEqual(expected);
    });

    it('ranks a large, mostly-approved sample above a tiny unanimous one', async () => {
      const ids = await fetchAllIds('top', author.id, 20);
      expect(ids.indexOf(fixture.largeMostlyApproved.id)).toBeLessThan(
        ids.indexOf(fixture.smallUnanimous.id),
      );
    });

    it('scores a drifted-negative likeCount identically to the same post floored at 0', async () => {
      const ids = await fetchAllIds('top', author.id, 20);
      // Same score → adjacent in the ordering (only _id separates them,
      // since every other input is identical).
      const a = ids.indexOf(fixture.driftedNegative.id);
      const b = ids.indexOf(fixture.flooredEquivalent.id);
      expect(Math.abs(a - b)).toBe(1);
    });

    it('breaks an exact score tie deterministically by _id desc', async () => {
      const ids = await fetchAllIds('top', author.id, 20);
      const a = ids.indexOf(fixture.tieA.id);
      const b = ids.indexOf(fixture.tieB.id);
      // tieB was created after tieA, so it has the larger _id and sorts first.
      expect(b).toBeLessThan(a);
      expect(Math.abs(a - b)).toBe(1);
    });

    it('ranks a comment-heavy zero-vote post above a zero-engagement post', async () => {
      const ids = await fetchAllIds('top', author.id, 20);
      expect(ids.indexOf(fixture.commentHeavyZeroVotes.id)).toBeLessThan(
        ids.indexOf(fixture.zeroEngagement.id),
      );
    });

    it('paginates with no duplicates or skips across pages of size 1', async () => {
      const wholePage = await fetchAllIds('top', author.id, 20);
      const pagedOneAtATime = await fetchAllIds('top', author.id, 1);

      expect(pagedOneAtATime).toEqual(wholePage);
      expect(new Set(pagedOneAtATime).size).toBe(pagedOneAtATime.length);
    });
  });

  describe('empty results', () => {
    it.each(['latest', 'discussed', 'top'] as const)(
      'sort=%s returns an empty page for an author with no posts, not an error',
      async (sort) => {
        const page = await fetchPage({
          sort,
          authorId: emptyAuthor.id,
          limit: 10,
        });
        expect(page).toEqual({ items: [], nextCursor: null });
      },
    );
  });

  describe('cursor validation', () => {
    it('rejects a discussed cursor replayed against sort=top', async () => {
      const discussedPage = await fetchPage({
        sort: 'discussed',
        authorId: author.id,
        limit: 1,
      });
      await http()
        .get('/posts')
        .query({
          sort: 'top',
          authorId: author.id,
          limit: 1,
          cursor: discussedPage.nextCursor!,
        })
        .expect(400);
    });

    it('rejects a top cursor replayed against sort=discussed', async () => {
      const topPage = await fetchPage({
        sort: 'top',
        authorId: author.id,
        limit: 1,
      });
      await http()
        .get('/posts')
        .query({
          sort: 'discussed',
          authorId: author.id,
          limit: 1,
          cursor: topPage.nextCursor!,
        })
        .expect(400);
    });

    it('rejects a discussed/top cursor replayed against sort=latest', async () => {
      const discussedPage = await fetchPage({
        sort: 'discussed',
        authorId: author.id,
        limit: 1,
      });
      await http()
        .get('/posts')
        .query({
          sort: 'latest',
          authorId: author.id,
          limit: 1,
          cursor: discussedPage.nextCursor!,
        })
        .expect(400);
    });

    it('rejects a latest cursor replayed against sort=discussed and sort=top', async () => {
      const latestPage = await fetchPage({
        sort: 'latest',
        authorId: author.id,
        limit: 1,
      });
      await http()
        .get('/posts')
        .query({
          sort: 'discussed',
          authorId: author.id,
          limit: 1,
          cursor: latestPage.nextCursor!,
        })
        .expect(400);
      await http()
        .get('/posts')
        .query({
          sort: 'top',
          authorId: author.id,
          limit: 1,
          cursor: latestPage.nextCursor!,
        })
        .expect(400);
    });

    it('rejects a discussed cursor with a non-numeric v', async () => {
      const bogus = Buffer.from(
        JSON.stringify({
          sort: 'discussed',
          v: 'not-a-number',
          id: fixture.tieA.id,
        }),
      ).toString('base64');
      await http()
        .get('/posts')
        .query({
          sort: 'discussed',
          authorId: author.id,
          limit: 1,
          cursor: bogus,
        })
        .expect(400);
    });

    it('rejects a top cursor with an invalid id', async () => {
      const bogus = Buffer.from(
        JSON.stringify({ sort: 'top', v: 1.23, id: 'not-an-object-id' }),
      ).toString('base64');
      await http()
        .get('/posts')
        .query({ sort: 'top', authorId: author.id, limit: 1, cursor: bogus })
        .expect(400);
    });

    it('rejects malformed (non-base64/non-JSON) cursors for discussed and top', async () => {
      await http()
        .get('/posts')
        .query({
          sort: 'discussed',
          authorId: author.id,
          limit: 1,
          cursor: 'not-valid-base64-json!!',
        })
        .expect(400);
      await http()
        .get('/posts')
        .query({
          sort: 'top',
          authorId: author.id,
          limit: 1,
          cursor: 'not-valid-base64-json!!',
        })
        .expect(400);
    });

    it('rejects sort=bogus at the DTO level', async () => {
      await http()
        .get('/posts')
        .query({ sort: 'bogus', authorId: author.id, limit: 1 })
        .expect(400);
    });
  });
});
