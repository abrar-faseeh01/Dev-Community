import type { ReactionType } from "@/types/reaction";
import { describeReactionSummary } from "../utils/summary";

type ReactionSummaryProps = {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
  onOpen: () => void;
};

// "You and 15 others reacted." above the reaction buttons. A button, because
// clicking it opens the list of who reacted. Renders nothing when nobody has
// reacted, so an untouched post or comment shows no empty line. Presentational
// only: the parent owns the overlay and the fetch.
export function ReactionSummary({
  likeCount,
  dislikeCount,
  myReaction,
  onOpen,
}: ReactionSummaryProps) {
  const text = describeReactionSummary({ likeCount, dislikeCount, myReaction });
  if (!text) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="rounded text-xs text-neutral-400 transition-colors hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
    >
      {text}
    </button>
  );
}
