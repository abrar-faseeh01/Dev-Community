import type { ReactionType } from "@/types/reaction";
import { describeReactionSummary } from "./summary";

const summary = (
  likeCount: number,
  dislikeCount: number,
  myReaction: ReactionType | null,
) => describeReactionSummary({ likeCount, dislikeCount, myReaction });

describe("describeReactionSummary", () => {
  describe("nobody reacted", () => {
    it("says nothing at all", () => {
      expect(summary(0, 0, null)).toBeNull();
    });

    it("says nothing for counters that drifted below zero", () => {
      expect(summary(-2, 0, null)).toBeNull();
      expect(summary(0, -1, null)).toBeNull();
    });
  });

  describe("only the viewer reacted", () => {
    it.each<[string, number, number, ReactionType]>([
      ["a like", 1, 0, "like"],
      ["a dislike", 0, 1, "dislike"],
    ])("says 'You reacted.' for %s", (_name, likes, dislikes, mine) => {
      expect(summary(likes, dislikes, mine)).toBe("You reacted.");
    });

    it("still says it when the counters lag a step behind the viewer's own reaction", () => {
      // The viewer has a reaction but the counts have not caught up (or have
      // drifted): they are at least one of the total, never "You and -1".
      expect(summary(0, 0, "like")).toBe("You reacted.");
      expect(summary(-3, 0, "dislike")).toBe("You reacted.");
    });
  });

  describe("the viewer and others", () => {
    it("names exactly one other in the singular", () => {
      expect(summary(2, 0, "like")).toBe("You and 1 other reacted.");
      expect(summary(0, 2, "dislike")).toBe("You and 1 other reacted.");
    });

    it("counts likes and dislikes together, whichever type the viewer gave", () => {
      // One like and one dislike: the other person is the dislike.
      expect(summary(1, 1, "like")).toBe("You and 1 other reacted.");
      expect(summary(1, 1, "dislike")).toBe("You and 1 other reacted.");
    });

    it("says 'others' for more than one, excluding the viewer from the number", () => {
      expect(summary(3, 0, "like")).toBe("You and 2 others reacted.");
      expect(summary(15, 1, "like")).toBe("You and 15 others reacted.");
      expect(summary(10, 6, "dislike")).toBe("You and 15 others reacted.");
    });

    it("formats large numbers with separators", () => {
      expect(summary(1204, 0, "like")).toBe("You and 1,203 others reacted.");
    });
  });

  describe("the viewer did not react, others did", () => {
    it("says '1 person' for one, whichever type it was", () => {
      expect(summary(1, 0, null)).toBe("1 person reacted.");
      expect(summary(0, 1, null)).toBe("1 person reacted.");
    });

    it("says 'people' with the combined total for more", () => {
      expect(summary(2, 0, null)).toBe("2 people reacted.");
      expect(summary(10, 6, null)).toBe("16 people reacted.");
      expect(summary(1204, 96, null)).toBe("1,300 people reacted.");
    });
  });
});
