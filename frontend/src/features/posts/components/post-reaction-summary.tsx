"use client";

import { useAuth } from "@/features/auth/hooks/use-auth";
import type { Post } from "@/features/posts/types/post";
import { usePostReactors } from "@/features/posts/queries/post-queries";
import { ReactionSummary } from "@/features/reactions/components/reaction-summary";
import { ReactorsModal } from "@/features/reactions/components/reactors-modal";
import type { ReactorTab } from "@/features/reactions/types/reactor";
import { useState } from "react";

// The "You and 15 others reacted." line for one post, and the overlay it
// opens. The counts come from the post itself, so the line follows an
// optimistic reaction instantly; the list of people is fetched only once the
// overlay is open (usePostReactors' `enabled`).
export function PostReactionSummary({ post }: { post: Post }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ReactorTab>("all");
  const reactors = usePostReactors(post.id, tab, open);

  return (
    <>
      <ReactionSummary
        likeCount={post.likeCount}
        dislikeCount={post.dislikeCount}
        myReaction={post.myReaction}
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
        likeCount={reactors.data?.likeCount ?? post.likeCount}
        dislikeCount={reactors.data?.dislikeCount ?? post.dislikeCount}
        reactors={reactors.data?.items}
        isPending={reactors.isPending}
        isError={reactors.isError}
        onRetry={() => reactors.refetch()}
        viewerId={user?.id ?? null}
      />
    </>
  );
}
