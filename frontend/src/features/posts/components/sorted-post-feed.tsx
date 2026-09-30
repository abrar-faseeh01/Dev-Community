"use client";

import { PostCardSkeleton } from "@/features/posts/components/post-card-skeleton";
import { PostFeed } from "@/features/posts/components/post-feed";
import { parsePostSort } from "@/features/posts/utils/feed-sort";
import { useSearchParams } from "next/navigation";

// What shows while the search params are being read (the Suspense boundary
// useSearchParams needs for `next build`). Same shape as the feed's own first
// load, so nothing jumps.
export function SortedPostFeedFallback() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading posts…</span>
      {Array.from({ length: 3 }, (_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Reads ?sort= from the URL and renders that sort's feed. The URL is the only
// source of truth — an unknown ?sort= value renders Latest without rewriting
// the URL. Changing the sort is FeedSortMenu's job (posts-view.tsx), not this
// component's: the two are siblings, both driven by the same URL, same as
// post-search-results.tsx and the ?q= it reads (itself written from the
// header's HeaderSearch, not from anything under posts-view.tsx).
//
// Callers wrap this in <Suspense> — same reason as FeedNotice.
export function SortedPostFeed() {
  const searchParams = useSearchParams();
  const sort = parsePostSort(searchParams.get("sort"));

  // key: a different sort is a different feed, so it starts from a fresh
  // component rather than reusing the previous sort's.
  return <PostFeed key={sort} sort={sort} />;
}
