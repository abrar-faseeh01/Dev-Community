"use client";

import { FeedTabs, feedTabId } from "@/features/posts/components/feed-tabs";
import { PostCardSkeleton } from "@/features/posts/components/post-card-skeleton";
import { PostFeed } from "@/features/posts/components/post-feed";
import {
  feedSortHref,
  parsePostSort,
  type PostSort,
} from "@/features/posts/utils/feed-sort";
import { usePathname, useSearchParams } from "next/navigation";
import { useId } from "react";

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

// The feed with its sort tabs. The URL is the only source of truth for the
// selected sort: the tabs and the feed both read the same parsed value, so
// they cannot disagree, and a copied link, a refresh, Back and Forward all
// land on the tab the URL names. An unknown ?sort= value renders Latest
// without rewriting the URL.
//
// Callers wrap this in <Suspense> — same reason as FeedNotice.
export function SortedPostFeed() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const idBase = useId();
  const panelId = `${idBase}-panel`;

  const sort = parsePostSort(searchParams.get("sort"));

  function handleChange(next: PostSort) {
    const href = feedSortHref(pathname, searchParams, next);
    const query = searchParams.toString();
    const currentHref = query ? `${pathname}?${query}` : pathname;
    // Choosing what the URL already says is not a navigation, so it adds no
    // history entry.
    if (href === currentHref) return;
    // window.history.pushState, not router.push: router.push runs through
    // the App Router's client-navigation transition, and once a <Suspense>
    // boundary has revealed content, a transition through it keeps the old
    // committed tree on screen until the whole update is ready — so
    // PostFeed's own isPending skeleton never gets to commit, and the
    // previous tab's posts stay up for the entire fetch. pushState updates
    // usePathname/useSearchParams without going through that transition, so
    // this is an ordinary state update: the new PostFeed mounts and its
    // skeleton commits immediately, same as any other prop change. It still
    // adds its own history entry, which is what makes Back and Forward walk
    // between tabs.
    window.history.pushState(null, "", href);
  }

  return (
    <>
      <FeedTabs
        value={sort}
        onChange={handleChange}
        idBase={idBase}
        panelId={panelId}
      />
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={feedTabId(idBase, sort)}
      >
        {/* key: a different sort is a different feed, so it starts from a
            fresh component rather than reusing the previous tab's. */}
        <PostFeed key={sort} sort={sort} />
      </div>
    </>
  );
}
