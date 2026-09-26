// Shared mutationKey prefix for usePostReaction (features/posts/mutations)
// and useCommentReaction (features/comments/mutations), so one
// isMutating({ mutationKey: reactionMutationKeys.all }) check in either
// hook's onSettled sees every in-flight reaction toggle, not just its own
// feature's. Structured the same way as postKeys/commentKeys.
export const reactionMutationKeys = {
  all: ["reactions"] as const,
  target: (type: "post" | "comment", id: string) =>
    [...reactionMutationKeys.all, type, id] as const,
};
