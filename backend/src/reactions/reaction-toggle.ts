import type { ReactionType } from './schemas/reaction.schema';

// Pure functions only — no Nest, no Mongoose, no database. The service runs
// the atomic writes and finds out which of the three things happened; this
// file turns that outcome into "what changes on the counters" and "what the
// caller's reaction is now". `import type` keeps the schema file (and with it
// Mongoose) out of this module at runtime.

// What the toggle actually did to the caller's reaction row:
//   created  - there was no row; one was inserted with the requested type
//   removed  - the row already had the requested type; it was deleted
//   switched - the row had the opposite type; it was changed to the requested
//              type in place
// The `type` every helper below takes is always the type the caller REQUESTED,
// which is also the row's new type after created/switched and the row's old
// type after removed.
export type ReactionAction = 'created' | 'removed' | 'switched';

export type CounterDelta = { likeCount: number; dislikeCount: number };

export function oppositeType(type: ReactionType): ReactionType {
  return type === 'like' ? 'dislike' : 'like';
}

// How much each stored counter on the Post/Comment moves.
//   created  like:    like +1
//   removed  like:    like -1
//   switched to like: like +1 and dislike -1  (it was a dislike before)
// and the mirror image for dislike. A switch is the only action that moves
// both counters, which is why the service applies the delta in one update.
export function counterDelta(
  action: ReactionAction,
  type: ReactionType,
): CounterDelta {
  const own = type === 'like' ? 'likeCount' : 'dislikeCount';
  const other = type === 'like' ? 'dislikeCount' : 'likeCount';

  const delta: CounterDelta = { likeCount: 0, dislikeCount: 0 };
  if (action === 'created') {
    delta[own] = 1;
  } else if (action === 'removed') {
    delta[own] = -1;
  } else {
    delta[own] = 1;
    delta[other] = -1;
  }
  return delta;
}

// The number a client is shown for a stored counter: never below zero, and 0
// when nothing is stored (a comment written before the counters existed).
// The counters are changed with a plain $inc so concurrent updates always
// converge (see ReactionsService.incrementCounters); the floor lives here, on
// the way out, because a floor applied while WRITING is what loses updates.
export function displayCount(stored: number | null | undefined): number {
  return Math.max(0, stored ?? 0);
}

// The caller's own reaction after the action: null once it is removed,
// otherwise the type they asked for. This is the `myReaction` in the response.
export function resultingReaction(
  action: ReactionAction,
  type: ReactionType,
): ReactionType | null {
  return action === 'removed' ? null : type;
}
