"use client";

import { ROUTES } from "@/constants/routes";
import { useMyPosts } from "@/features/posts/queries/post-queries";
import { describeLoadError } from "@/features/posts/utils/errors";
import { FEED_NOTICES } from "@/features/posts/utils/notices";
import { getPostActor } from "@/features/posts/utils/permissions";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import Link from "next/link";
import { useState } from "react";
import { PostActions } from "./post-actions";
import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./post-card-skeleton";
import { PostReactionSummary } from "./post-reaction-summary";
import { PostReactions } from "./post-reactions";

const FIRST_LOAD_SKELETON_COUNT = 3;
const NEXT_PAGE_SKELETON_COUNT = 2;

const retryButtonClass =
  "shrink-0 rounded-lg border border-red-900/50 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/40 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60";

type MyPostsProps = {
  // The signed-in viewer, for Edit/Delete gating via getPostActor — null
  // covers both "not logged in" and "auth still loading", same convention
  // getPostActor itself uses. /posts/mine's only caller (my-posts-view.tsx)
  // always has a non-null user by the time it renders this (useRequireAuth
  // already redirected otherwise).
  user: { id: string; role: "admin" | "user" } | null;
  // Whose posts to list. Optional because /posts/mine never passes it — there
  // it always means "the viewer's own". The Profile page's Posts tab passes
  // the profile being viewed instead, which can differ from the viewer (an
  // admin, or an unrelated signed-in user, browsing someone else's posts).
  authorId?: string;
};

// Every live post the given author has written, newest first, each with Edit
// and Delete for whoever getPostActor says may use them. Same paging as the
// feed (GET /posts, filtered to the author, so the cursor and ordering rules
// are identical) and the same states: loading, error with Retry, empty, next
// page loading / failing, and the end.
export function MyPosts({ user, authorId }: MyPostsProps) {
  // Falls back to the viewer's own id — the only case /posts/mine ever needs,
  // where `user` is guaranteed non-null by that page's own guard.
  const targetAuthorId = authorId ?? user?.id ?? "";
  // Only true when the list being shown is the viewer's own — gates the
  // empty-state "Write your first post" CTA below so it doesn't invite a
  // visitor to write on somebody else's empty list.
  const isOwnList = !!user && user.id === targetAuthorId;

  // What the last delete did. The page stays where it is (unlike deleting from
  // a post's own page, which has to leave it), so it says so here.
  const [notice, setNotice] = useState<string | null>(null);

  const list = useMyPosts(targetAuthorId);

  const sentinelRef = useInfiniteScroll<HTMLDivElement>({
    enabled: list.hasNextPage && !list.isFetching && !list.isFetchNextPageError,
    onIntersect: () => {
      list.fetchNextPage();
    },
  });

  if (list.isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Loading your posts…</span>
        {list.failureCount > 0 && (
          <p className="text-sm text-neutral-400">
            Trouble reaching the server — retrying (attempt{" "}
            {list.failureCount + 1})…
          </p>
        )}
        {Array.from({ length: FIRST_LOAD_SKELETON_COUNT }, (_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (list.isError && !list.data) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-red-900/50 bg-red-950/40 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-red-300">
            Couldn&rsquo;t load your posts
          </p>
          <p className="text-sm text-red-300">
            {describeLoadError(list.error, "Failed to load your posts.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => list.refetch()}
          disabled={list.isFetching}
          className={retryButtonClass}
        >
          {list.isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  const posts = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      {notice && (
        <div
          role="status"
          className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-white"
        >
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded px-1 font-medium text-emerald-400 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
          >
            Dismiss
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900 p-8 text-center">
          <p className="text-base font-semibold text-white">
            {isOwnList ? "You haven’t written any posts yet" : "No posts yet"}
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            {isOwnList
              ? "Posts you publish will show up here, where you can edit or delete them."
              : "Nothing has been shared here so far."}
          </p>
          {isOwnList && user?.role === "user" && (
            <Link
              href={ROUTES.POSTS_CREATE}
              className="mt-4 inline-block rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            >
              Write your first post
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => {
            const actor = getPostActor(user, post);
            return (
              <li key={post.id}>
                <PostCard
                  post={post}
                  linkAuthor
                  footer={
                    <div className="flex flex-col items-start gap-2">
                      <PostReactionSummary post={post} />
                      <div className="flex w-full flex-wrap items-center justify-between gap-3">
                        <PostReactions post={post} />
                        {actor && (
                          <PostActions
                            post={post}
                            actor={actor}
                            variant="solid"
                            onRemoved={({ alreadyGone }) =>
                              setNotice(
                                alreadyGone
                                  ? FEED_NOTICES["post-gone"]
                                  : FEED_NOTICES["post-deleted"],
                              )
                            }
                          />
                        )}
                      </div>
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {posts.length > 0 &&
        (list.isFetchNextPageError ? (
          <div
            role="alert"
            className="mt-4 flex flex-col gap-3 rounded-xl border border-red-900/50 bg-red-950/40 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-red-300">
                Couldn&rsquo;t load more posts
              </p>
              <p className="text-sm text-red-300">
                {describeLoadError(list.error, "Failed to load more posts.")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
              className={retryButtonClass}
            >
              {list.isFetchingNextPage ? "Loading…" : "Try again"}
            </button>
          </div>
        ) : list.isFetchingNextPage ? (
          <div
            role="status"
            aria-busy="true"
            className="mt-4 flex flex-col gap-4"
          >
            <span className="sr-only">Loading more of your posts…</span>
            {Array.from({ length: NEXT_PAGE_SKELETON_COUNT }, (_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        ) : list.hasNextPage ? (
          <div ref={sentinelRef} aria-hidden="true" className="h-px" />
        ) : (
          <p className="mt-6 border-t border-neutral-800 pt-4 text-center text-sm text-neutral-400">
            {isOwnList
              ? "That’s all your posts."
              : "That’s all — no more posts."}
          </p>
        ))}
    </>
  );
}
