import type { QueryClient } from "@tanstack/react-query";
import type { Post } from "../types/post";
import {
  patchPostInFeed,
  prependPostToFeed,
  removePostFromFeed,
  type FeedData,
} from "./post-cache";
import { postKeys } from "./posts";

// A post can be cached in three kinds of place: the feed, its own detail
// entry, and the "Posts made by you" list for its author. The "mine" lists
// have the same shape as the feed, and are matched by prefix so every
// author's list (in practice, just the signed-in user's) is covered.

// After a create: seed the detail page so it opens without a request, put the
// post at the top of the cached feed and of its author's list (if either is
// already cached), and mark both stale so the server's own order is what ends
// up on screen.
export function applyPostCreated(queryClient: QueryClient, created: Post) {
  queryClient.setQueryData(postKeys.detail(created.id), created);
  queryClient.setQueryData<FeedData>(postKeys.feed(), (feed) =>
    prependPostToFeed(feed, created),
  );
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.mine(created.author.id) },
    (feed) => prependPostToFeed(feed, created),
  );
  queryClient.invalidateQueries({ queryKey: postKeys.feed() });
  queryClient.invalidateQueries({ queryKey: postKeys.mineAll() });
}

// After an edit: the detail page and every cached copy of the post in the
// feed and in the author's list show the server's version, without a
// refetch. Sorting is by _id, so an edit never moves the post.
export function applyPostUpdate(queryClient: QueryClient, updated: Post) {
  queryClient.setQueryData(postKeys.detail(updated.id), updated);
  queryClient.setQueryData<FeedData>(postKeys.feed(), (feed) =>
    patchPostInFeed(feed, updated),
  );
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.mineAll() },
    (feed) => patchPostInFeed(feed, updated),
  );
}

// After a delete, or after finding out the post is already gone: take it out
// of the cached feed and lists and drop its detail entry so Back can't show
// it again.
//
// Only an *unobserved* detail entry is removed here. On the post's own page
// the entry is still being watched, and removing it would make that page
// fetch it again (and flash "not found") in the moment before it navigates
// away — that page removes it itself once it has unmounted.
export function forgetPost(queryClient: QueryClient, id: string) {
  queryClient.setQueryData<FeedData>(postKeys.feed(), (feed) =>
    removePostFromFeed(feed, id),
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
}
