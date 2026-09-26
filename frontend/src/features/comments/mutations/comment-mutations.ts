import { reactionMutationKeys } from "@/features/reactions/mutations/reaction-mutation-keys";
import type { ReactionResult } from "@/features/reactions/types/reaction-result";
import {
  currentUserId,
  isSameSession,
} from "@/features/reactions/utils/session-guard";
import { applyReaction } from "@/features/reactions/utils/toggle";
import {
  createComment,
  deleteComment,
  updateComment,
} from "@/services/api/comments";
import { toggleCommentReaction } from "@/services/api/reactions";
import type { ReactionType } from "@/types/reaction";
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { commentKeys } from "../queries/comment-queries";
import type {
  CreatedComment,
  DeletedComment,
  EditedComment,
} from "../types/comment";
import {
  adjustPostCommentCount,
  patchCommentBody,
  restoreCommentTree,
  snapshotCommentTree,
  writeCommentReaction,
} from "../utils/comment-cache-updates";
import { hasStatus } from "../utils/errors";

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
    onSuccess: async (...args) => {
      adjustPostCommentCount(queryClient, postId, 1);
      await queryClient.invalidateQueries({
        queryKey: commentKeys.list(postId),
      });
      return options.onSuccess?.(...args);
    },
    onError: options.onError,
  });
}

type UpdateCommentInput = { id: string; body: string };

export function useUpdateComment(
  postId: string,
  options: Callbacks<EditedComment, UpdateCommentInput> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCommentInput) =>
      updateComment(input.id, input.body),
    onSuccess: (edited, ...rest) => {
      patchCommentBody(
        queryClient,
        postId,
        edited.id,
        edited.body,
        edited.updatedAt,
      );
      return options.onSuccess?.(edited, ...rest);
    },
    onError: options.onError,
  });
}

type DeleteCommentInput = { id: string; reason?: string };

export function useDeleteComment(
  postId: string,
  options: Callbacks<DeletedComment, DeleteCommentInput> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteCommentInput) =>
      deleteComment(input.id, input.reason),
    onSuccess: async (deleted, ...rest) => {
      adjustPostCommentCount(queryClient, postId, -deleted.deletedCount);
      await queryClient.invalidateQueries({
        queryKey: commentKeys.list(postId),
      });
      return options.onSuccess?.(deleted, ...rest);
    },
    onError: options.onError,
  });
}

type CommentReactionVars = { type: ReactionType; current: ReactionResult };

// Like/dislike on a comment: the same shape as usePostReaction, but its own
// hook — comments must not import from the posts feature. Only one cache
// entry is involved (commentKeys.list(postId) — no feed/mine equivalent for
// comments), so there's no prefix handling to do.
export function useCommentReaction(postId: string, commentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: reactionMutationKeys.target("comment", commentId),
    mutationFn: ({ type }: CommentReactionVars) =>
      toggleCommentReaction(commentId, type),
    onMutate: async ({ type, current }: CommentReactionVars) => {
      await queryClient.cancelQueries({ queryKey: commentKeys.list(postId) });

      const snapshot = snapshotCommentTree(queryClient, postId);
      writeCommentReaction(
        queryClient,
        postId,
        commentId,
        applyReaction(current, type),
      );

      return { snapshot, userId: currentUserId(queryClient) };
    },
    onSuccess: (result, _vars, context) => {
      if (isSameSession(queryClient, context?.userId ?? null)) {
        writeCommentReaction(queryClient, postId, commentId, result);
      }
    },
    onError: (error, _vars, context) => {
      if (context && isSameSession(queryClient, context.userId)) {
        restoreCommentTree(queryClient, postId, context.snapshot);
      }
      if (hasStatus(error, 404)) {
        queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
      }
    },
    onSettled: () => {
      if (
        queryClient.isMutating({ mutationKey: reactionMutationKeys.all }) === 1
      ) {
        queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) });
      }
    },
  });
}
