import type { InfiniteData } from "@tanstack/react-query";
import type { Post, PostPage } from "../types/post";

// Pure helpers for keeping the cached feed correct after a mutation
// without refetching every loaded page. Kept free of any runtime imports so
// they can be exercised on their own. Both return new objects (never
// mutate) and pass `undefined` straight through, which is what
// queryClient.setQueryData's updater receives when nothing is cached yet.
export type FeedData = InfiniteData<PostPage, string | undefined>;

// Put a just-created post at the top of the first cached page. New posts have
// the highest _id, so the feed's order puts them first. The first page's
// nextCursor is the id of its own last item and is untouched, so the pages
// after it still chain correctly. Skipped if the post is already in the feed
// (a refetch got there first) or nothing is cached yet.
export function prependPostToFeed(
  feed: FeedData | undefined,
  created: Post,
): FeedData | undefined {
  if (!feed || feed.pages.length === 0) return feed;
  const alreadyThere = feed.pages.some((page) =>
    page.items.some((post) => post.id === created.id),
  );
  if (alreadyThere) return feed;
  const [first, ...rest] = feed.pages;
  return {
    ...feed,
    pages: [{ ...first, items: [created, ...first.items] }, ...rest],
  };
}

// Replace one post in place inside whichever cached page holds it. The feed
// is ordered by _id, and an edit never changes _id, so the post can't move.
export function patchPostInFeed(
  feed: FeedData | undefined,
  updated: Post,
): FeedData | undefined {
  if (!feed) return feed;
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      items: page.items.map((post) => (post.id === updated.id ? updated : post)),
    })),
  };
}

// Adjust one post's commentCount in every cached page that has it, without
// replacing the post the way patchPostInFeed does — a comment mutation only
// knows the postId and the delta (+1 on create, -deletedCount on a cascade
// delete), not a full updated Post. Clamped at 0, mirroring the backend's
// own clamp. This only fixes the count; it doesn't move the post within a
// sort like Most Discussed — that still needs a refetch, same as before.
export function adjustCommentCountInFeed(
  feed: FeedData | undefined,
  postId: string,
  delta: number,
): FeedData | undefined {
  if (!feed) return feed;
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      items: page.items.map((post) =>
        post.id === postId
          ? { ...post, commentCount: Math.max(0, post.commentCount + delta) }
          : post,
      ),
    })),
  };
}

// Drop one post from every cached page. A page's nextCursor is the id of
// its last item and the server filters on `_id < cursor`, so it stays valid
// even when that item itself is the one removed.
export function removePostFromFeed(
  feed: FeedData | undefined,
  id: string,
): FeedData | undefined {
  if (!feed) return feed;
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      items: page.items.filter((post) => post.id !== id),
    })),
  };
}
