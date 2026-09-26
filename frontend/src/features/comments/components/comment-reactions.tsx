"use client";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCommentReaction } from "@/features/comments/mutations/comment-mutations";
import type { Comment } from "@/features/comments/types/comment";
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

type CommentReactionsProps = {
  comment: Comment;
  size?: ReactionButtonsSize;
};

// One instance per comment. Same wiring as PostReactions but its own
// component — comments must not import from the posts feature, so each
// feature imports only its own mutation hook. Defaults to "sm": comment
// rows are the compact size.
export function CommentReactions({
  comment,
  size = "sm",
}: CommentReactionsProps) {
  const { user, loading } = useAuth();
  const mode: ReactionButtonsMode = getReactionMode({ user, loading });
  const { mutate, isPending, isError, error } = useCommentReaction(
    comment.postId,
    comment.id,
  );

  const queryClient = useQueryClient();

  const onToggle = useCallback(
    (type: ReactionType) => {
      // One request per target: see isReactionInFlight for why this is not
      // just the buttons' pending state.
      if (isReactionInFlight(queryClient, "comment", comment.id)) return;
      mutate({
        type,
        current: {
          likeCount: comment.likeCount,
          dislikeCount: comment.dislikeCount,
          myReaction: comment.myReaction,
        },
      });
    },
    [
      mutate,
      queryClient,
      comment.id,
      comment.likeCount,
      comment.dislikeCount,
      comment.myReaction,
    ],
  );

  return (
    <ReactionButtons
      likeCount={comment.likeCount}
      dislikeCount={comment.dislikeCount}
      myReaction={comment.myReaction}
      mode={mode}
      pending={isPending}
      errorMessage={isError ? describeReactionError(error) : null}
      onToggle={onToggle}
      size={size}
    />
  );
}
