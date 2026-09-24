// A user's reaction to a post or a comment — mirrors backend/src/reactions/
// schemas/reaction.schema.ts's ReactionType. Shared because both posts and
// comments carry the caller's own reaction (`myReaction`).
export type ReactionType = "like" | "dislike";
