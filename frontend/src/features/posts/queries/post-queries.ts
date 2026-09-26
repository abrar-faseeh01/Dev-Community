import type { ReactorTab } from "@/features/reactions/types/reactor";
import { getPost, getPostPage } from "@/services/api/posts";
import { getPostReactors } from "@/services/api/reactions";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

// One factory for every posts cache key, so a mutation can target exactly
// the entries it affects. Everything nests under ["posts"], so
// invalidating postKeys.all would hit both feed and detail. Day 14 adds a
// filter argument to feed().
export const postKeys = {
  all: ["posts"] as const,
  feed: () => [...postKeys.all, "feed"] as const,
  detail: (id: string) => [...postKeys.all, "detail", id] as const,
  // One author's posts ("Posts made by you"). mineAll is the prefix for every
  // author, so a mutation can update or invalidate all of them at once.
  mineAll: () => [...postKeys.all, "mine"] as const,
  mine: (authorId: string) => [...postKeys.mineAll(), authorId] as const,
  // The "who reacted" list of one post, one entry per tab.
  reactors: (id: string, tab: ReactorTab) =>
    [...postKeys.all, "reactors", id, tab] as const,
};

// The cursor-paginated GET /posts: each page's `nextCursor` (null on the last
// one) becomes the next page's param, so nothing computes an offset or a
// page number.
export function usePostFeed() {
  return useInfiniteQuery({
    queryKey: postKeys.feed(),
    queryFn: ({ pageParam }) => getPostPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

// Same paging as the feed, filtered to one author, so the cursor and
// ordering rules are identical.
export function useMyPosts(authorId: string) {
  return useInfiniteQuery({
    queryKey: postKeys.mine(authorId),
    queryFn: ({ pageParam }) => getPostPage(pageParam, authorId),
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
