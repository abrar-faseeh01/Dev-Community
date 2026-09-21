"use client";

import { ROUTES } from "@/constants/routes";
import { describeLoadError } from "@/features/posts/utils/errors";
import { FEED_NOTICES } from "@/features/posts/utils/notices";
import { getPostActor } from "@/features/posts/utils/permissions";
import { useMyPosts } from "@/features/posts/queries/post-queries";
import Link from "next/link";
import { useState } from "react";
import { PostActions } from "./post-actions";
import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./post-card-skeleton";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

const FIRST_LOAD_SKELETON_COUNT = 3;
const NEXT_PAGE_SKELETON_COUNT = 2;

const retryButtonClass =
  "shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60";

type MyPostsProps = {
  user: { id: string; role: "admin" | "user" };
};

// Every live post the signed-in user has written, newest first, each with Edit
// and Delete. Same paging as the feed (GET /posts, filtered to the author, so
// the cursor and ordering rules are identical) and the same states: loading,
// error with Retry, empty, next page loading / failing, and the end.
export function MyPosts({ user }: MyPostsProps) {
  // What the last delete did. The page stays where it is (unlike deleting from
  // a post's own page, which has to leave it), so it says so here.
  const [notice, setNotice] = useState<string | null>(null);

  const list = useMyPosts(user.id);

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
          <p className="text-sm text-muted">
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
        className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-red-700">
            Couldn&rsquo;t load your posts
          </p>
          <p className="text-sm text-red-700">
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
          className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-foreground"
        >
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded px-1 font-medium text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            Dismiss
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-base font-semibold text-foreground">
            You haven&rsquo;t written any posts yet
          </p>
          <p className="mt-1 text-sm text-muted">
            Posts you publish will show up here, where you can edit or delete
            them.
          </p>
          {user.role === "user" && (
            <Link
              href={ROUTES.POSTS_CREATE}
              className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30"
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
                    actor ? (
                      <PostActions
                        post={post}
                        actor={actor}
                        onRemoved={({ alreadyGone }) =>
                          setNotice(
                            alreadyGone
                              ? FEED_NOTICES["post-gone"]
                              : FEED_NOTICES["post-deleted"],
                          )
                        }
                      />
                    ) : undefined
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
            className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-red-700">
                Couldn&rsquo;t load more posts
              </p>
              <p className="text-sm text-red-700">
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
          <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted">
            That&rsquo;s all your posts.
          </p>
        ))}
    </>
  );
}
