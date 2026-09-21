"use client";

import { ROUTES } from "@/constants/routes";
import {
  AdminBadge,
  PostDeleteButton,
  PostEditLink,
} from "@/features/posts/components/post-actions";
import { PostDetail } from "@/features/posts/components/post-detail";
import { PostDetailSkeleton } from "@/features/posts/components/post-detail-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { describeLoadError, isPostNotFound } from "@/features/posts/utils/errors";
import { feedNoticeUrl } from "@/features/posts/utils/notices";
import { getPostActor } from "@/features/posts/utils/permissions";
import { postKeys, usePost } from "@/features/posts/queries/post-queries";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const retryButtonClass =
  "shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60";

export function PostPageView({ id }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Set when this page deletes the post (or finds it already gone). The
  // cached copy can't be dropped right then — this page is still watching it,
  // and would fetch it again (a flash of "not found") before the navigation
  // lands — so it is dropped once the page has unmounted.
  const removedRef = useRef(false);
  useEffect(
    () => () => {
      if (removedRef.current) {
        queryClient.removeQueries({ queryKey: postKeys.detail(id), exact: true });
      }
    },
    [queryClient, id],
  );

  // The public GET /posts/:id — no login needed to read a post. A 4xx
  // (unknown id, deleted post, malformed id) isn't retried (see
  // lib/tanstack/query-client.ts), so "not found" shows straight away.
  const postQuery = usePost(id);
  const post = postQuery.data;
  const actor = post ? getPostActor(user, post) : null;

  // Name the browser tab after the post, and put the previous title back on
  // the way out so it doesn't linger on the next page.
  const title = post?.title;
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} — Dev Community`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <Link
          href={ROUTES.POSTS}
          className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          <span aria-hidden="true">←</span> Back to feed
        </Link>

        {postQuery.isPending ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            {/* A heading, not a bare span: every page needs an h1, including
                while its content is still on the way. */}
            <h1 className="sr-only">Loading post…</h1>
            {/* Only once the first attempt has failed and a retry is
                running — otherwise a dead backend looks like a slow one. */}
            {postQuery.failureCount > 0 && (
              <p className="text-sm text-muted">
                Trouble reaching the server — retrying (attempt{" "}
                {postQuery.failureCount + 1})…
              </p>
            )}
            <PostDetailSkeleton />
          </div>
        ) : postQuery.isError ? (
          isPostNotFound(postQuery.error) ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
              <h1 className="text-lg font-semibold text-foreground">
                Post not found
              </h1>
              <p className="mt-1 text-sm text-muted">
                It may have been deleted, or the link may be wrong.
              </p>
              <Link
                href={ROUTES.POSTS}
                className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                Go to the feed
              </Link>
            </div>
          ) : (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h1 className="text-sm font-semibold text-red-700">
                  Couldn&rsquo;t load this post
                </h1>
                <p className="text-sm text-red-700">
                  {describeLoadError(postQuery.error, "Failed to load post.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => postQuery.refetch()}
                disabled={postQuery.isFetching}
                className={retryButtonClass}
              >
                {postQuery.isFetching ? "Retrying…" : "Retry"}
              </button>
            </div>
          )
        ) : (
          postQuery.isSuccess && (
            <PostDetail
              post={postQuery.data}
              linkAuthor={!!user}
              headerAction={
                actor ? (
                  <>
                    {actor === "moderator" && <AdminBadge />}
                    <PostEditLink post={postQuery.data} actor={actor} />
                  </>
                ) : undefined
              }
              footer={
                actor ? (
                  <PostDeleteButton
                    post={postQuery.data}
                    actor={actor}
                    label={
                      actor === "moderator" ? "Delete as admin" : "Delete post"
                    }
                    onRemoved={({ alreadyGone }) => {
                      removedRef.current = true;
                      router.replace(
                        feedNoticeUrl(alreadyGone ? "post-gone" : "post-deleted"),
                      );
                    }}
                  />
                ) : undefined
              }
            />
          )
        )}
      </div>
    </main>
  );
}
