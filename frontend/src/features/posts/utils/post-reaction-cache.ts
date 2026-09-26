import type { ReactionResult } from "@/features/reactions/types/reaction-result";
import type { QueryClient } from "@tanstack/react-query";
import { postKeys } from "../queries/post-queries";
import type { Post } from "../types/post";
import type { FeedData } from "./post-cache";

// Pure helpers for writing a reaction result into cached post data, matching
// post-cache.ts's contract: return a new object, never mutate, pass
// `undefined` straight through.

export function patchReactionOnPost(
  post: Post | undefined,
  state: ReactionResult,
): Post | undefined {
  if (!post) return post;
  return {
    ...post,
    likeCount: state.likeCount,
    dislikeCount: state.dislikeCount,
    myReaction: state.myReaction,
  };
}

export function patchReactionInFeed(
  feed: FeedData | undefined,
  postId: string,
  state: ReactionResult,
): FeedData | undefined {
  if (!feed) return feed;
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      items: page.items.map((post) =>
        post.id === postId ? (patchReactionOnPost(post, state) as Post) : post,
      ),
    })),
  };
}

// main cache write function, called from the mutation's onSuccess and onMutate.
// Writes a reaction result into every cached place a post can live: its
// detail entry, the feed, and every cached "mine" list. Matched by prefix
// (mineAll(), not mine(authorId)) so this keeps working once Day 14 adds a
// filter argument to feed()/mine().
export function writePostReaction(
  queryClient: QueryClient,
  postId: string,
  state: ReactionResult,
) {
  queryClient.setQueryData<Post>(postKeys.detail(postId), (post) =>
    patchReactionOnPost(post, state),
  );
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.feed() },
    (feed) => patchReactionInFeed(feed, postId, state),
  );
  queryClient.setQueriesData<FeedData>(
    { queryKey: postKeys.mineAll() },
    (feed) => patchReactionInFeed(feed, postId, state),
  );
}

export type PostReactionSnapshot = {
  detail: [readonly unknown[], Post | undefined];
  feed: [readonly unknown[], FeedData | undefined][];
  mine: [readonly unknown[], FeedData | undefined][];
};

// Captures every cached entry a reaction write could touch, so onError can
// put back exactly what was there before rather than recompute the
// pre-toggle numbers.
export function snapshotPostCaches(
  queryClient: QueryClient,
  postId: string,
): PostReactionSnapshot {
  return {
    detail: [
      postKeys.detail(postId),
      queryClient.getQueryData<Post>(postKeys.detail(postId)),
    ],
    feed: queryClient.getQueriesData<FeedData>({ queryKey: postKeys.feed() }),
    mine: queryClient.getQueriesData<FeedData>({
      queryKey: postKeys.mineAll(),
    }),
  };
}

export function restorePostCaches(
  queryClient: QueryClient,
  snapshot: PostReactionSnapshot,
) {
  const [detailKey, detailData] = snapshot.detail;
  queryClient.setQueryData(detailKey, detailData);
  for (const [key, data] of snapshot.feed) {
    queryClient.setQueryData(key, data);
  }
  for (const [key, data] of snapshot.mine) {
    queryClient.setQueryData(key, data);
  }
}
