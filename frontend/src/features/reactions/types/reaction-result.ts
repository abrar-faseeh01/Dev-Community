import type { ReactionType } from "@/types/reaction";

// Mirrors backend/src/reactions/dto/reaction-response.dto.ts (ReactionResultDto)
// — the shape returned by both POST /posts/:id/reaction and
// POST /comments/:id/reaction.
export type ReactionResult = {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
};
