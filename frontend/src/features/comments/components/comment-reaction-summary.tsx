"use client";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCommentReactors } from "@/features/comments/queries/comment-queries";
import type { Comment } from "@/features/comments/types/comment";
import { ReactionSummary } from "@/features/reactions/components/reaction-summary";
import { ReactorsModal } from "@/features/reactions/components/reactors-modal";
import type { ReactorTab } from "@/features/reactions/types/reactor";
import { useState } from "react";

// The "You and 3 others reacted." line for one comment, and the overlay it
// opens. Same as PostReactionSummary but its own component — comments must not
// import from the posts feature.
export function CommentReactionSummary({ comment }: { comment: Comment }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ReactorTab>("all");
  const reactors = useCommentReactors(comment.id, tab, open);

  return (
    <>
      <ReactionSummary
        likeCount={comment.likeCount}
        dislikeCount={comment.dislikeCount}
        myReaction={comment.myReaction}
        onOpen={() => {
          setTab("all");
          setOpen(true);
        }}
      />
      <ReactorsModal
        open={open}
        onClose={() => setOpen(false)}
        tab={tab}
        onTabChange={setTab}
        likeCount={reactors.data?.likeCount ?? comment.likeCount}
        dislikeCount={reactors.data?.dislikeCount ?? comment.dislikeCount}
        reactors={reactors.data?.items}
        isPending={reactors.isPending}
        isError={reactors.isError}
        onRetry={() => reactors.refetch()}
        viewerId={user?.id ?? null}
      />
    </>
  );
}
