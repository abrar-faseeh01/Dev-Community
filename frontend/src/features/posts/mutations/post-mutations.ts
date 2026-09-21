import { createPost, deletePost, updatePost } from "@/services/api/posts";
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import type { DeletedPost, Post } from "../types/post";
import { hasStatus } from "../utils/errors";
import {
  applyPostCreated,
  applyPostUpdate,
  forgetPost,
} from "../utils/post-cache-updates";

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
      // Seed the detail page, put the post at the top of the cached feed and
      // of the author's "Posts made by you" list, and mark both stale so the
      // server's own ordering is what ends up on screen.
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
      // Already deleted by someone else: it is gone either way, so the same
      // cleanup applies.
      if (hasStatus(args[0], 404)) forgetPost(queryClient, postId);
      return options.onError?.(...args);
    },
  });
}
