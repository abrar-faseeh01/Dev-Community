import { computeRankScore, wilsonLowerBound } from './ranking';

// A table of the formula's own contract. It does not prove the Mongo
// aggregation matches this — that's posts-ranking.e2e-spec.ts's parity
// test, run against a real database.

describe('wilsonLowerBound', () => {
  it('is 0 when there are no votes at all', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('never returns a negative number, even where floats round below 0', () => {
    // likes=0 makes p=0, where the numerator's two halves are
    // mathematically equal but accumulate independent rounding error —
    // this is the reproducible float-artifact case from the plan review,
    // not a hypothetical.
    for (const dislikes of [1, 5, 50, 1000, 1_000_000]) {
      expect(wilsonLowerBound(0, dislikes)).toBeGreaterThanOrEqual(0);
    }
  });

  it('ranks a large, high-approval sample above a tiny unanimous one', () => {
    // The property Wilson exists for: don't let a fresh 10/0 post outrank
    // an established 500/50 post just because its raw ratio is higher.
    const smallUnanimous = wilsonLowerBound(10, 0);
    const largeMostlyApproved = wilsonLowerBound(500, 50);
    expect(largeMostlyApproved).toBeGreaterThan(smallUnanimous);
  });

  it('scores a post with more dislikes than likes below one that is even', () => {
    const moreDislikes = wilsonLowerBound(10, 20);
    const even = wilsonLowerBound(15, 15);
    expect(moreDislikes).toBeLessThan(even);
  });

  it('scores heavy likes above heavy dislikes at the same sample size', () => {
    expect(wilsonLowerBound(90, 10)).toBeGreaterThan(wilsonLowerBound(10, 90));
  });
});

describe('computeRankScore', () => {
  function input(overrides: Partial<Parameters<typeof computeRankScore>[0]>) {
    return {
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
      ...overrides,
    };
  }

  it('scores a zero-vote, zero-comment post at exactly 0', () => {
    expect(computeRankScore(input({}))).toBe(0);
  });

  it('two posts with identical inputs tie exactly (the _id tie-breaker decides, not this)', () => {
    const a = computeRankScore(
      input({ likeCount: 12, dislikeCount: 3, commentCount: 4 }),
    );
    const b = computeRankScore(
      input({ likeCount: 12, dislikeCount: 3, commentCount: 4 }),
    );
    expect(a).toBe(b);
  });

  it('floors a drifted-negative raw counter to score identically to that counter at 0', () => {
    const drifted = computeRankScore(
      input({ likeCount: -5, dislikeCount: 2, commentCount: 3 }),
    );
    const flooredExplicitly = computeRankScore(
      input({ likeCount: 0, dislikeCount: 2, commentCount: 3 }),
    );
    expect(drifted).toBe(flooredExplicitly);
  });

  it('a likes=0 post with dislikes still produces a score >= 0, not a tiny negative', () => {
    const score = computeRankScore(
      input({ likeCount: 0, dislikeCount: 5, commentCount: 1 }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('more comments raises the score, all else equal', () => {
    const fewComments = computeRankScore(
      input({ likeCount: 5, dislikeCount: 1, commentCount: 1 }),
    );
    const manyComments = computeRankScore(
      input({ likeCount: 5, dislikeCount: 1, commentCount: 20 }),
    );
    expect(manyComments).toBeGreaterThan(fewComments);
  });

  it('has no time component: identical counters score identically regardless of when the post was made', () => {
    // There is deliberately no createdAt/nowMs in RankScoreInput at all —
    // this test exists so a future edit can't reintroduce a decay term
    // without a test noticing the API shape changed.
    const post = { likeCount: 8, dislikeCount: 2, commentCount: 5 };
    expect(computeRankScore(input(post))).toBe(computeRankScore(input(post)));
  });
});
