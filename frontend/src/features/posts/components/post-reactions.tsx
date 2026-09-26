"use client";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { usePostReaction } from "@/features/posts/mutations/post-mutations";
import type { Post } from "@/features/posts/types/post";
import {
  ReactionButtons,
  type ReactionButtonsMode,
  type ReactionButtonsSize,
} from "@/features/reactions/components/reaction-buttons";
import { describeReactionError } from "@/features/reactions/utils/errors";
import { isReactionInFlight } from "@/features/reactions/utils/in-flight";
import { getReactionMode } from "@/features/reactions/utils/reaction-mode";
import type { ReactionType } from "@/types/reaction";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

type PostReactionsProps = {
  post: Post;
  size?: ReactionButtonsSize;
};

// One instance per post card / detail page. Owns nothing but wiring: auth
// state decides the mode, usePostReaction does the mutation and the cache
// work, this component just connects the two to <ReactionButtons>. No axios,
// no services/api import here — lint enforces that on reaction-buttons.tsx,
// and this file stays clean of it too so the dependency only ever runs one
// way (component -> hook -> service).
export function PostReactions({ post, size }: PostReactionsProps) {
  const { user, loading } = useAuth();
  const mode: ReactionButtonsMode = getReactionMode({ user, loading });
  const mutation = usePostReaction(post.id);
  // `mutation` is a new object every render, but `mutate` is stable — depend
  // on that so onToggle only changes when the numbers it captures do.
  const { mutate } = mutation;
  const queryClient = useQueryClient();

  const onToggle = useCallback(
    (type: ReactionType) => {
      // One request per target: see isReactionInFlight for why this is not
      // just the buttons' pending state.
      if (isReactionInFlight(queryClient, "post", post.id)) return;
      mutate({
        type,
        current: {
          likeCount: post.likeCount,
          dislikeCount: post.dislikeCount,
          myReaction: post.myReaction,
        },
      });
    },
    [
      mutate,
      queryClient,
      post.id,
      post.likeCount,
      post.dislikeCount,
      post.myReaction,
    ],
  );

  return (
    <ReactionButtons
      likeCount={post.likeCount}
      dislikeCount={post.dislikeCount}
      myReaction={post.myReaction}
      mode={mode}
      pending={mutation.isPending}
      errorMessage={
        mutation.isError ? describeReactionError(mutation.error) : null
      }
      onToggle={onToggle}
      size={size}
    />
  );
}
