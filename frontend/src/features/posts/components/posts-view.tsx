"use client";
import { FeedNotice } from "@/features/posts/components/feed-notice";
import { FeedSortMenu } from "@/features/posts/components/feed-sort-menu";
import { PostSearchResults } from "@/features/posts/components/post-search-results";
import { SortedPostFeedFallback } from "@/features/posts/components/sorted-post-feed";
import { Suspense } from "react";

// Search and "New post" now live in the site header (components/layout) —
// this page only composes the sort control and the feed/results below it.
export function PostsView() {
  return (
    <main className="flex flex-1 justify-center bg-neutral-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-emerald-400">
              Community
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Posts
            </h1>
          </div>

          {/* FeedSortMenu reads the URL's search params too, same reason as
              FeedNotice/PostSearchResults below. */}
          <Suspense fallback={null}>
            <FeedSortMenu />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <FeedNotice />
        </Suspense>

        <Suspense fallback={<SortedPostFeedFallback />}>
          <PostSearchResults />
        </Suspense>
      </div>
    </main>
  );
}
