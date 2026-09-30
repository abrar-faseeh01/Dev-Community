import type { QueryClient } from "@tanstack/react-query";
import { postKeys } from "../queries/post-queries";
import type { Post } from "../types/post";
import {
  patchPostInFeed,
  prependPostToFeed,
  removePostFromFeed,
  type FeedData,
} from "./post-cache";

// A post can be cached in three kinds of place: the feed, its own detail
// entry, and the "Posts made by you" list for its author. The "mine" lists
// have the same shape as the feed, and are matched by prefix so every
// author's list (in practice, just the signed-in user's) is covered.

// After a create: seed the detail page so it opens without a request, put the
// post at the top of the cached Latest feed and of its author's list (if
// either is already cached), and mark every feed and list stale so the
// server's own order is what ends up on screen.

// Only Latest gets the prepend: a new post has the highest _id, so newest
// first is the one order where the client knows where it goes. Its position
// under Top or Discussed is decided by the server, so those are only marked
// stale and refetch the next time they are shown.
export function applyPostCreated(queryClient: QueryClient, created: Post) {
  queryClient.setQueryData(postKeys.detail(created.id), created);
  queryClient.setQueryData<FeedData>(postKeys.feed("latest"), (feed) =>
    prependPostToFeed(feed, created),
  );
  // A post that was just created always has a real author (the signed-in
  // user); the null check only narrows the type for the deleted-author case.
  if (created.author.id) {
    queryClient.setQueriesData<FeedData>(
      { queryKey: postKeys.mine(created.author.id) },
      (feed) => prependPostToFeed(feed, created),
    );
  }
  queryClient.invalidateQueries({ queryKey: postKeys.feedAll() });
  queryClient.invalidateQueries({ queryKey: postKeys.mineAll() });
  // A new post may match a search that is already cached.
  queryClient.invalidateQueries({ queryKey: postKeys.searchAll() });
}

// After an edit: the detail page and every cached copy of the post — under
// every sort of the feed, and in the author's list — show the server's
// version, without a refetch. An edit changes none of the counters a sort
// orders by, so it never moves the post.
export function applyPostUpdate(queryClient: QueryClient, updated: Post) {
  queryClient.setQueryData(postKeys.detail(updated.id), updated);
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.feedAll() },
    (feed) => patchPostInFeed(feed, updated),
  );
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.mineAll() },
    (feed) => patchPostInFeed(feed, updated),
  );
  // Cached search results are a different shape from a feed, so they are
  // marked stale rather than patched. The title and body they show are the
  // ones this edit just changed.
  queryClient.invalidateQueries({ queryKey: postKeys.searchAll() });
}

// After a delete, or after finding out the post is already gone: take it out
// of every cached feed (all sorts) and list and drop its detail entry so Back
// can't show it again.
//
// Only an *unobserved* detail entry is removed here. On the post's own page
// the entry is still being watched, and removing it would make that page
// fetch it again (and flash "not found") in the moment before it navigates
// away — that page removes it itself once it has unmounted.
export function forgetPost(queryClient: QueryClient, id: string) {
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.feedAll() },
    (feed) => removePostFromFeed(feed, id),
  );
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.mineAll() },
    (feed) => removePostFromFeed(feed, id),
  );
  queryClient.removeQueries({
    queryKey: postKeys.detail(id),
    exact: true,
    type: "inactive",
  });
  // A deleted post must not stay in a cached search. Marked stale, not
  // patched, for the same reason as in applyPostUpdate.
  queryClient.invalidateQueries({ queryKey: postKeys.searchAll() });
}
