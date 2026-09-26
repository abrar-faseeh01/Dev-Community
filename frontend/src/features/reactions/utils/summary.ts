import type { ReactionType } from "@/types/reaction";

type SummaryInput = {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
};

const format = (n: number) => n.toLocaleString("en-US");

// The line above the reaction buttons ("You and 15 others reacted."), or null
// when there is nothing to say.
//
// No names, on purpose: the list of reactors is only fetched when the overlay
// opens, so a name here would need it fetched up front (or a new field on
// every post and comment). Counts and `myReaction` are already on the post or
// comment, so this line costs nothing and updates instantly with an
// optimistic reaction.
//
// "Others" is likes and dislikes combined — everyone who reacted, the same
// number as the overlay's All tab. The viewer counts as one of the total when
// they have a reaction, and a viewer who has one always makes the total at
// least 1, so a counter that momentarily lags cannot show "You and -1 others".
export function describeReactionSummary({
  likeCount,
  dislikeCount,
  myReaction,
}: SummaryInput): string | null {
  const total = Math.max(likeCount + dislikeCount, myReaction ? 1 : 0);
  if (total <= 0) return null;

  if (myReaction) {
    const others = total - 1;
    if (others === 0) return "You reacted.";
    if (others === 1) return "You and 1 other reacted.";
    return `You and ${format(others)} others reacted.`;
  }

  return total === 1 ? "1 person reacted." : `${format(total)} people reacted.`;
}
