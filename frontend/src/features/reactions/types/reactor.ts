import type { AuthorSummary } from "@/types/author-summary";
import type { ReactionType } from "@/types/reaction";

// One person in a "who reacted" list. Mirrors backend/src/reactions/
// reactor-row.ts's Reactor. A deleted account arrives as the usual
// AuthorSummary placeholder (id null, "Deleted user"), so a row never needs a
// null check to render.
export type Reactor = {
  user: AuthorSummary;
  type: ReactionType;
};

// GET posts/:id/reactions and GET comments/:id/reactions. `items` is the most
// recent reactors first, capped by the server (50). The counts are the
// target's true totals, unaffected by the cap or by the `type` filter.
export type ReactorList = {
  items: Reactor[];
  likeCount: number;
  dislikeCount: number;
};

// The overlay's tabs: everyone, or one reaction type.
export type ReactorTab = "all" | ReactionType;
