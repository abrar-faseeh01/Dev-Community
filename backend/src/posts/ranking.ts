import { displayCount } from '../reactions/reaction-toggle';

// Pure function only — no Nest, no Mongoose, no database, no Date.now()
// call anywhere in this file. This is the single documented source of
// truth for the sort=top formula's math; the aggregation pipeline in
// posts.service.ts expresses the same arithmetic in Mongo operators and
// is proved to match this function by posts-ranking.e2e-spec.ts (parity
// test), not by construction — the two are written independently.
//
// Formula (locked 2026-09-28, revised same day to drop time decay):
//   likes/dislikes/comments are floored at 0 with the same displayCount
//   semantics every other read path already applies, so a drifted-negative
//   raw counter can't corrupt the ranking the way it can't corrupt a
//   response body.
//   n      = likes + dislikes
//   p      = likes / n                                   (only when n > 0)
//   wilson = 0 when n == 0, else the Evan Miller / Wilson-score lower
//            bound of the true like-proportion at Z's confidence level —
//            rewards both approval ratio and sample size, so a 10/0 post
//            doesn't outrank a 500/50 post.
//   rankScore = wilson * VOTE_WEIGHT + comments * COMMENT_WEIGHT
//
// Deliberately no time-decay term. top ranks "best by engagement", not
// "trending right now" — latest already covers pure recency, and adding
// decay would have meant a second cursor shape (frozen nowMs) and a whole
// class of tests proving the freeze holds, for a behavior nothing in the
// spec actually asked for. Because this formula depends only on the three
// stored counters, top's cursor is the same {sort, v, id} shape as
// discussed's — no nowMs anywhere in this file or its cursor.
//
// wilson is floored at 0 explicitly even though it is bounded to [0,1] on
// paper — verified numerically that likes=0, dislikes=5 produces a tiny
// negative float (~-3.14e-17) from rounding in the two halves of the
// numerator, so the floor is a real fix, not defensive paranoia. This is
// the only way this formula can go negative; VOTE_WEIGHT * wilson and
// comments * COMMENT_WEIGHT are both non-negative once wilson is floored.
export const Z = 1.96; // 95% confidence
export const VOTE_WEIGHT = 100;
export const COMMENT_WEIGHT = 2;

export interface RankScoreInput {
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
}

export function wilsonLowerBound(likes: number, dislikes: number): number {
  const n = likes + dislikes;
  if (n === 0) {
    return 0;
  }

  const p = likes / n;
  const z2 = Z * Z;

  const numerator =
    p + z2 / (2 * n) - Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const denominator = 1 + z2 / n;

  // See the file-level comment: this can come out as a hair below 0 for
  // some (likes, dislikes) pairs purely from float rounding, not from the
  // math itself, which is bounded to [0, 1].
  return Math.max(0, numerator / denominator);
}

export function computeRankScore(input: RankScoreInput): number {
  const likes = displayCount(input.likeCount);
  const dislikes = displayCount(input.dislikeCount);
  const comments = displayCount(input.commentCount);

  const wilson = wilsonLowerBound(likes, dislikes);
  return wilson * VOTE_WEIGHT + comments * COMMENT_WEIGHT;
}
