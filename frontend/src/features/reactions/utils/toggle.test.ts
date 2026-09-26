import type { ReactionResult } from "../types/reaction-result";
import { applyReaction } from "./toggle";

function state(overrides: Partial<ReactionResult> = {}): ReactionResult {
  return { likeCount: 0, dislikeCount: 0, myReaction: null, ...overrides };
}

describe("applyReaction", () => {
  it("creates a like from no reaction", () => {
    const result = applyReaction(
      state({ likeCount: 2, dislikeCount: 1 }),
      "like",
    );
    expect(result).toEqual({
      likeCount: 3,
      dislikeCount: 1,
      myReaction: "like",
    });
  });

  it("creates a dislike from no reaction", () => {
    const result = applyReaction(
      state({ likeCount: 2, dislikeCount: 1 }),
      "dislike",
    );
    expect(result).toEqual({
      likeCount: 2,
      dislikeCount: 2,
      myReaction: "dislike",
    });
  });

  it("removes an existing like", () => {
    const result = applyReaction(
      state({ likeCount: 3, dislikeCount: 1, myReaction: "like" }),
      "like",
    );
    expect(result).toEqual({ likeCount: 2, dislikeCount: 1, myReaction: null });
  });

  it("removes an existing dislike", () => {
    const result = applyReaction(
      state({ likeCount: 2, dislikeCount: 2, myReaction: "dislike" }),
      "dislike",
    );
    expect(result).toEqual({ likeCount: 2, dislikeCount: 1, myReaction: null });
  });

  it("switches from dislike to like", () => {
    const result = applyReaction(
      state({ likeCount: 2, dislikeCount: 2, myReaction: "dislike" }),
      "like",
    );
    expect(result).toEqual({
      likeCount: 3,
      dislikeCount: 1,
      myReaction: "like",
    });
  });

  it("switches from like to dislike", () => {
    const result = applyReaction(
      state({ likeCount: 3, dislikeCount: 1, myReaction: "like" }),
      "dislike",
    );
    expect(result).toEqual({
      likeCount: 2,
      dislikeCount: 2,
      myReaction: "dislike",
    });
  });

  it("floors likeCount at 0 instead of going negative", () => {
    const result = applyReaction(
      state({ likeCount: 0, dislikeCount: 0, myReaction: "like" }),
      "like",
    );
    expect(result.likeCount).toBe(0);
    expect(result.myReaction).toBeNull();
  });

  it("floors dislikeCount at 0 instead of going negative", () => {
    const result = applyReaction(
      state({ likeCount: 0, dislikeCount: 0, myReaction: "dislike" }),
      "dislike",
    );
    expect(result.dislikeCount).toBe(0);
    expect(result.myReaction).toBeNull();
  });

  it("does not mutate the input state", () => {
    const input = state({ likeCount: 1, dislikeCount: 0 });
    const snapshot = { ...input };
    applyReaction(input, "like");
    expect(input).toEqual(snapshot);
  });

  it("toggling the same type twice returns to the original state", () => {
    const original = state({ likeCount: 2, dislikeCount: 1 });
    const once = applyReaction(original, "like");
    const twice = applyReaction(once, "like");
    expect(twice).toEqual(original);
  });
});
