"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { CommentFeedLink } from "@/features/comments/components/comment-feed-link";
import { usePostFeed } from "@/features/posts/queries/post-queries";
import { describeLoadError } from "@/features/posts/utils/errors";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import Link from "next/link";
import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./post-card-skeleton";
import { PostReactionSummary } from "./post-reaction-summary";
import { PostReactions } from "./post-reactions";

const FIRST_LOAD_SKELETON_COUNT = 3;
const NEXT_PAGE_SKELETON_COUNT = 2;

const retryButtonClass =
  "shrink-0 rounded-lg border border-red-900/50 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/40 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60";

// The feed list. Reads the cursor-paginated GET /posts through
// useInfiniteQuery: each page's `nextCursor` (null on the last one) becomes
// the next page's param, so nothing here ever computes an offset or a page
// number. Kept as its own component so the Day 14 feed tabs can reuse it
// with a different query key.
export function PostFeed() {
  const { user } = useAuth();

  const feed = usePostFeed();

  // Auto-load only when nothing else is going on: there is a next page, no
  // fetch is already running (first load, next page, or a background
  // refetch — calling fetchNextPage during one would cancel and restart it),
  // and the last next-page fetch didn't fail. After a failure the sentinel
  // would still be on screen and retry in a tight loop, so the reader gets a
  // "Try again" button instead. Declared before the early returns below —
  // hooks can't be called conditionally.
  const sentinelRef = useInfiniteScroll<HTMLDivElement>({
    enabled: feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError,
    onIntersect: () => {
      feed.fetchNextPage();
    },
  });

  if (feed.isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Loading posts…</span>
        {/* Only after the first attempt has failed and a retry is running —
            otherwise a dead backend looks like a slow one for ~3 seconds. */}
        {feed.failureCount > 0 && (
          <p className="text-sm text-neutral-400">
            Trouble reaching the server — retrying (attempt{" "}
            {feed.failureCount + 1})…
          </p>
        )}
        {Array.from({ length: FIRST_LOAD_SKELETON_COUNT }, (_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // First load failed and there's nothing to show. A failed *next page*
  // (or background refetch) also sets isError but keeps `data`, and is
  // handled below the list so the posts already loaded stay on screen.
  if (feed.isError && !feed.data) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-red-900/50 bg-red-950/40 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-red-300">
            Couldn&rsquo;t load posts
          </p>
          <p className="text-sm text-red-300">
            {describeLoadError(feed.error, "Failed to load posts.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => feed.refetch()}
          disabled={feed.isFetching}
          className={retryButtonClass}
        >
          {feed.isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900 p-8 text-center">
        <p className="text-base font-semibold text-white">No posts yet</p>
        <p className="mt-1 text-sm text-neutral-400">
          Nothing has been shared with the community so far.
        </p>
        {user?.role === "user" && (
          <Link
            href={ROUTES.POSTS_CREATE}
            className="mt-4 inline-block rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          >
            Create the first post
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard
              post={post}
              linkAuthor={!!user}
              footer={
                <div className="flex flex-col items-start gap-2">
                  <PostReactionSummary post={post} />
                  <div className="flex flex-wrap items-center gap-4">
                    <PostReactions post={post} />
                    <CommentFeedLink
                      postId={post.id}
                      commentCount={post.commentCount}
                    />
                  </div>
                </div>
              }
            />
          </li>
        ))}
      </ul>

      {/* Below the list, in order of precedence: a failed next page, a page
          loading, the invisible trigger, or — with nothing left — the end. */}
      {feed.isFetchNextPageError ? (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-xl border border-red-900/50 bg-red-950/40 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-red-300">
              Couldn&rsquo;t load more posts
            </p>
            <p className="text-sm text-red-300">
              {describeLoadError(feed.error, "Failed to load more posts.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            className={retryButtonClass}
          >
            {feed.isFetchingNextPage ? "Loading…" : "Try again"}
          </button>
        </div>
      ) : feed.isFetchingNextPage ? (
        <div
          role="status"
          aria-busy="true"
          className="mt-4 flex flex-col gap-4"
        >
          <span className="sr-only">Loading more posts…</span>
          {Array.from({ length: NEXT_PAGE_SKELETON_COUNT }, (_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : feed.hasNextPage ? (
        <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      ) : (
        <p className="mt-6 border-t border-neutral-800 pt-4 text-center text-sm text-neutral-400">
          You&rsquo;re all caught up.
        </p>
      )}
    </>
  );
}
