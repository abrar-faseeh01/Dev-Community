import { createPost, deletePost, updatePost } from "@/services/api/posts";
import { togglePostReaction } from "@/services/api/reactions";
import { reactionMutationKeys } from "@/features/reactions/mutations/reaction-mutation-keys";
import type { ReactionResult } from "@/features/reactions/types/reaction-result";
import { applyReaction } from "@/features/reactions/utils/toggle";
import {
  currentUserId,
  isSameSession,
} from "@/features/reactions/utils/session-guard";
import type { ReactionType } from "@/types/reaction";
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import type { DeletedPost, Post } from "../types/post";
import { postKeys } from "../queries/post-queries";
import { hasStatus } from "../utils/errors";
import {
  applyPostCreated,
  applyPostUpdate,
  forgetPost,
} from "../utils/post-cache-updates";
import {
  restorePostCaches,
  snapshotPostCaches,
  writePostReaction,
} from "../utils/post-reaction-cache";

// Each hook does the API call plus the cache bookkeeping that always goes
// with it. What the screen does next (navigate, close a dialog, show a
// notice) stays with the caller, passed as onSuccess/onError; they run after
// the cache has been updated.
type Callbacks<TData, TVars> = Pick<
  UseMutationOptions<TData, Error, TVars>,
  "onSuccess" | "onError"
>;

type CreatePostInput = { title: string; body: string };
type PostChanges = { title?: string; body?: string; reason?: string };

export function useCreatePost(options: Callbacks<Post, CreatePostInput> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPost,
    onSuccess: (...args) => {
      applyPostCreated(queryClient, args[0]);
      return options.onSuccess?.(...args);
    },
    onError: options.onError,
  });
}

export function useUpdatePost(
  postId: string,
  options: Callbacks<Post, PostChanges> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: PostChanges) => updatePost(postId, changes),
    onSuccess: (...args) => {
      applyPostUpdate(queryClient, args[0]);
      return options.onSuccess?.(...args);
    },
    onError: options.onError,
  });
}

export function useDeletePost(
  postId: string,
  options: Callbacks<DeletedPost, string | undefined> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => deletePost(postId, reason),
    onSuccess: (...args) => {
      forgetPost(queryClient, postId);
      return options.onSuccess?.(...args);
    },
    onError: (...args) => {
      if (hasStatus(args[0], 404)) forgetPost(queryClient, postId);
      return options.onError?.(...args);
    },
  });
}

type ReactionVars = { type: ReactionType; current: ReactionResult };

// Like/dislike on a post: instant optimistic write, exact rollback, and a
// reconcile in onSettled that only fires once every in-flight reaction
// mutation (post or comment) has settled — see reactionMutationKeys.
// `current` is what the card is showing at the moment of the click, so the
// optimistic write starts from exactly what the user sees.
export function usePostReaction(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: reactionMutationKeys.target("post", postId),
    mutationFn: ({ type }: ReactionVars) => togglePostReaction(postId, type),
    onMutate: async ({ type, current }: ReactionVars) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: postKeys.detail(postId) }),
        queryClient.cancelQueries({ queryKey: postKeys.feed() }),
        queryClient.cancelQueries({ queryKey: postKeys.mineAll() }),
      ]);

      const snapshot = snapshotPostCaches(queryClient, postId);
      writePostReaction(queryClient, postId, applyReaction(current, type));

      return { snapshot, userId: currentUserId(queryClient) };
    },
    onSuccess: (result, _vars, context) => {
      if (isSameSession(queryClient, context?.userId ?? null)) {
        writePostReaction(queryClient, postId, result);
      }
    },
    onError: (error, _vars, context) => {
      if (context && isSameSession(queryClient, context.userId)) {
        restorePostCaches(queryClient, context.snapshot);
      }
      if (hasStatus(error, 404)) {
        forgetPost(queryClient, postId);
      }
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: reactionMutationKeys.all }) === 1) {
        queryClient.invalidateQueries({ queryKey: postKeys.detail(postId), exact: true });
        queryClient.invalidateQueries({ queryKey: postKeys.feed() });
        queryClient.invalidateQueries({ queryKey: postKeys.mineAll() });
      }
    },
  });
}