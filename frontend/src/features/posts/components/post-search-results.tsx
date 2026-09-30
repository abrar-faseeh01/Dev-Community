"use client";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { PostCard } from "@/features/posts/components/post-card";
import { PostCardSkeleton } from "@/features/posts/components/post-card-skeleton";
import { SortedPostFeed } from "@/features/posts/components/sorted-post-feed";
import { useSearchPosts } from "@/features/posts/queries/post-queries";
import { describeLoadError } from "@/features/posts/utils/errors";
import { normalizeSearchTerm } from "@/features/posts/utils/search-term";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

const SKELETON_COUNT = 3;

const retryButtonClass =
  "shrink-0 rounded-lg border border-red-900/50 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/40 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60";

// What sits below the header's search box: the sorted feed while ?q= names
// nothing to search for, the search results once it does. Typing, debouncing
// and writing ?q= are all HeaderSearch's job (components/layout) — this only
// ever reads it, the same way SortedPostFeed reads ?sort= rather than owning
// the control that changes it.
//
// Signed-in only, same as the header hides the box for a signed-out reader:
// a ?q= that reaches this page some other way (a shared link, a session that
// has since ended) is ignored, and the plain feed shows instead.
//
// Callers wrap this in <Suspense> — it reads the URL's search params, which
// `next build` refuses without one.
export function PostSearchResults() {
  const { user, loading } = useAuth();
  const canSearch = !loading && !!user;

  const searchParams = useSearchParams();
  const searchTerm = canSearch
    ? normalizeSearchTerm(searchParams.get("q") ?? "")
    : "";

  const query = useSearchPosts(searchTerm);

  if (searchTerm.length === 0) {
    return <SortedPostFeed />;
  }

  let body: ReactNode;
  if (query.isPending) {
    // isPending, not isFetching: a re-run of a cached term refetches in the
    // background with its results still on screen.
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Searching posts…</span>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (!query.data) {
    // Not pending and no data: the search failed. (A failed background
    // refetch keeps its data and is not treated as a failure.)
    body = (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-red-900/50 bg-red-950/40 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-red-300">
            Couldn&rsquo;t search posts
          </p>
          <p className="text-sm text-red-300">
            {describeLoadError(query.error, "Search failed.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className={retryButtonClass}
        >
          {query.isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  } else if (query.data.items.length === 0) {
    body = (
      <div
        role="status"
        className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900 p-8 text-center"
      >
        <p className="text-base font-semibold text-white wrap-anywhere">
          No posts match &ldquo;{searchTerm}&rdquo;
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          Check the spelling or try a different word.
        </p>
      </div>
    );
  } else {
    body = (
      <>
        <ul className="flex flex-col gap-4">
          {query.data.items.map((post) => (
            <li key={post.id}>
              {/* Read-only cards: no reaction footer, so nothing here needs
                  the feed's optimistic cache writers. linkAuthor as in
                  post-feed.tsx — /profile/[id] needs a login. */}
              <PostCard post={post} linkAuthor={!!user} />
            </li>
          ))}
        </ul>
        {query.data.hasMore && (
          <p role="status" className="mt-4 text-sm text-neutral-400">
            Showing the top {query.data.items.length} matches. Refine your
            search to narrow it down.
          </p>
        )}
      </>
    );
  }

  return body;
}
