import { createComment, deleteComment, updateComment } from "@/services/api/comments";
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { adjustPostCommentCount, patchCommentBody } from "../utils/comment-cache-updates";
import { commentKeys } from "../queries/comment-queries";
import type { CreatedComment, DeletedComment, EditedComment } from "../types/comment";

// Same split as post-mutations.ts: the hook does the API call plus the cache
// bookkeeping that always goes with it; what the screen does next (close a
// form, focus something) stays with the caller via onSuccess/onError, run
// after the cache has already been updated.
type Callbacks<TData, TVars> = Pick<
  UseMutationOptions<TData, Error, TVars>,
  "onSuccess" | "onError"
>;

type CreateCommentInput = { body: string; parentCommentId?: string };

export function useCreateComment(
  postId: string,
  options: Callbacks<CreatedComment, CreateCommentInput> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) => createComment(postId, input),
    // async: per "Cache strategy", the mutation's own isPending stays true
    // for the whole refetch, not just the POST, because TanStack Query
    // awaits this before flipping to the success state. commentKeys.list
    // is always actively observed here — every create fires from within the
    // mounted comment list — so invalidateQueries' default refetchType:
    // 'active' always triggers, and its promise resolves once that refetch
    // has landed.
    onSuccess: async (...args) => {
      adjustPostCommentCount(queryClient, postId, 1);
      await queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
      return options.onSuccess?.(...args);
    },
    onError: options.onError,
  });
}

type UpdateCommentInput = { id: string; body: string };

// No refetch: per "Cache strategy", an edit can't change the tree's
// structure, only its own body/updatedAt, so patchCommentBody's synchronous
// in-place patch is enough — unlike create/delete there's no invalidate to
// await, so this onSuccess doesn't need to be async.
export function useUpdateComment(
  postId: string,
  options: Callbacks<EditedComment, UpdateCommentInput> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCommentInput) => updateComment(input.id, input.body),
    onSuccess: (edited, ...rest) => {
      patchCommentBody(queryClient, postId, edited.id, edited.body, edited.updatedAt);
      return options.onSuccess?.(edited, ...rest);
    },
    onError: options.onError,
  });
}

type DeleteCommentInput = { id: string; reason?: string };

// Instantiated per comment-item (like useDeletePost is per PostDeleteButton),
// not shared across the tree the way replyMutation/updateMutation are — a
// delete confirmation is a modal, not a slot in the one-open-form-at-a-time
// coordination, so there's no reason for one comment's pending/error state
// to show up on another's Delete button.
export function useDeleteComment(
  postId: string,
  options: Callbacks<DeletedComment, DeleteCommentInput> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteCommentInput) => deleteComment(input.id, input.reason),
    // async, same reasoning as create: the cascade's exact size (deletedCount)
    // only comes back in the response, and the tree's own removal of the
    // deleted subtree has to be awaited here so the caller's focus-target
    // effect (comment-list.tsx) runs against the already-updated tree.
    onSuccess: async (deleted, ...rest) => {
      adjustPostCommentCount(queryClient, postId, -deleted.deletedCount);
      await queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
      return options.onSuccess?.(deleted, ...rest);
    },
    onError: options.onError,
  });
}
