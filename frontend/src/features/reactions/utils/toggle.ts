import type { ReactionType } from "@/types/reaction";
import type { ReactionResult } from "../types/reaction-result";

type ReactionAction = "created" | "removed" | "switched";

function actionFor(
  current: ReactionType | null,
  type: ReactionType,
): ReactionAction {
  if (current === null) return "created";
  return current === type ? "removed" : "switched";
}

// Mirrors backend/src/reactions/reaction-toggle.ts's pure helpers
// (counterDelta, resultingReaction), so the optimistic UI update always
// lands on the same numbers the server will compute, without importing
// anything from the backend. Pure: never mutates `state`, always returns a
// new object. Counts are floored at 0 the same way the backend floors them
// on the way out, so a client starting from a correct displayed count can
// never show a negative one.
export function applyReaction(
  state: ReactionResult,
  type: ReactionType,
): ReactionResult {
  const action = actionFor(state.myReaction, type);
  const own = type === "like" ? "likeCount" : "dislikeCount";
  const other = type === "like" ? "dislikeCount" : "likeCount";

  const next: ReactionResult = { ...state };
  if (action === "created") {
    next[own] = state[own] + 1;
  } else if (action === "removed") {
    next[own] = state[own] - 1;
  } else {
    next[own] = state[own] + 1;
    next[other] = state[other] - 1;
  }

  next.likeCount = Math.max(0, next.likeCount);
  next.dislikeCount = Math.max(0, next.dislikeCount);
  next.myReaction = action === "removed" ? null : type;

  return next;
}
