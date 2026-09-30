import type { PostSort } from "@/features/posts/utils/feed-sort";
import type { ReactorTab } from "@/features/reactions/types/reactor";
import { getPost, getPostPage, searchPosts } from "@/services/api/posts";
import { getPostReactors } from "@/services/api/reactions";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

// One factory for every posts cache key, so a mutation can target exactly
// the entries it affects. Everything nests under ["posts"], so
// invalidating postKeys.all would hit both feed and detail.
export const postKeys = {
  all: ["posts"] as const,
  // Prefix for the feed of every sort. Anything that must reach all of them
  // (patching a post everywhere it is cached, cancelling or invalidating the
  // feeds) targets this; feed(sort) is one sort's own entry. `sort` is
  // required on feed(), so a call site that forgets it is a compile error
  // rather than a write to the wrong cache entry.
  feedAll: () => [...postKeys.all, "feed"] as const,
  feed: (sort: PostSort) => [...postKeys.feedAll(), sort] as const,
  detail: (id: string) => [...postKeys.all, "detail", id] as const,
  // One author's posts ("Posts made by you"). mineAll is the prefix for every
  // author, so a mutation can update or invalidate all of them at once.
  mineAll: () => [...postKeys.all, "mine"] as const,
  mine: (authorId: string) => [...postKeys.mineAll(), authorId] as const,

  // Search results, one entry per normalized term. searchAll is the prefix,
  // so a mutation can mark every cached search stale at once.
  searchAll: () => [...postKeys.all, "search"] as const,
  search: (term: string) => [...postKeys.searchAll(), term] as const,

  // The "who reacted" list of one post, one entry per tab.
  reactors: (id: string, tab: ReactorTab) =>
    [...postKeys.all, "reactors", id, tab] as const,
};

// The cursor-paginated GET /posts for one sort: each page's `nextCursor`
// (null on the last one) becomes the next page's param, so nothing computes
// an offset or a page number. Each sort has its own key, so its pages and
// cursors are never mixed with another sort's.
export function usePostFeed(sort: PostSort) {
  return useInfiniteQuery({
    queryKey: postKeys.feed(sort),
    queryFn: ({ pageParam }) => getPostPage({ cursor: pageParam, sort }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

// Same paging as the feed, filtered to one author, so the cursor and
// ordering rules are identical. Always the default (latest) order — no sort
// is sent.
export function useMyPosts(authorId: string) {
  return useInfiniteQuery({
    queryKey: postKeys.mine(authorId),
    queryFn: ({ pageParam }) => getPostPage({ cursor: pageParam, authorId }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

// The public GET /posts/:id — no login needed to read a post. The detail and
// edit pages share this cache entry.
export function usePost(id: string) {
  return useQuery({
    queryKey: postKeys.detail(id),
    queryFn: () => getPost(id),
  });
}

// Who reacted to a post, for the overlay. Fetched only while `enabled` (the
// overlay is open), never alongside the post. staleTime 0 so that every open
// shows the current list: reactions change all the time, and the list is small
// and capped. The previous result still shows while it refetches.
export function usePostReactors(
  postId: string,
  tab: ReactorTab,
  enabled: boolean,
) {
  return useQuery({
    queryKey: postKeys.reactors(postId, tab),
    queryFn: () => getPostReactors(postId, tab === "all" ? undefined : tab),
    enabled,
    staleTime: 0,
  });
}

// GET /posts/search for one term. The caller passes the term already
// normalized (trimmed, collapsed, clamped) and debounced, so this hook stays
// as plain as usePost. An empty term never fetches. `signal` is forwarded so
// that a term the user has moved past is cancelled rather than left to finish.
export function useSearchPosts(term: string) {
  return useQuery({
    queryKey: postKeys.search(term),
    queryFn: ({ signal }) => searchPosts({ q: term, signal }),
    enabled: term.length > 0,
  });
}
