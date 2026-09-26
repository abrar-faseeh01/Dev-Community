import { QueryClient } from "@tanstack/react-query";
import { postKeys } from "../queries/post-queries";
import type { Post } from "../types/post";
import type { FeedData } from "./post-cache";
import {
  patchReactionInFeed,
  patchReactionOnPost,
  restorePostCaches,
  snapshotPostCaches,
  writePostReaction,
} from "./post-reaction-cache";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    title: "t",
    body: "b",
    likeCount: 0,
    dislikeCount: 0,
    commentCount: 0,
    myReaction: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: { id: "author-1", fullName: "Author", headline: null },
    ...overrides,
  };
}

function makeFeed(posts: Post[]): FeedData {
  return {
    pages: [{ items: posts, nextCursor: null }],
    pageParams: [undefined],
  };
}

describe("patchReactionOnPost", () => {
  it("replaces likeCount, dislikeCount and myReaction", () => {
    const post = makePost({ likeCount: 1, dislikeCount: 0, myReaction: null });
    const result = patchReactionOnPost(post, {
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });
    expect(result).toEqual({ ...post, likeCount: 2, myReaction: "like" });
  });

  it("leaves every other field untouched", () => {
    const post = makePost({ title: "Original title" });
    const result = patchReactionOnPost(post, {
      likeCount: 5,
      dislikeCount: 1,
      myReaction: "dislike",
    });
    expect(result?.title).toBe("Original title");
  });

  it("passes undefined through", () => {
    expect(
      patchReactionOnPost(undefined, {
        likeCount: 1,
        dislikeCount: 0,
        myReaction: "like",
      }),
    ).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const post = makePost();
    const snapshot = { ...post };
    patchReactionOnPost(post, {
      likeCount: 9,
      dislikeCount: 9,
      myReaction: "like",
    });
    expect(post).toEqual(snapshot);
  });
});

describe("patchReactionInFeed", () => {
  it("patches only the matching post across pages", () => {
    const other = makePost({ id: "post-2", likeCount: 4 });
    const target = makePost({ id: "post-1", likeCount: 1 });
    const feed: FeedData = {
      pages: [
        { items: [target], nextCursor: "post-1" },
        { items: [other], nextCursor: null },
      ],
      pageParams: [undefined, "post-1"],
    };

    const result = patchReactionInFeed(feed, "post-1", {
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });

    expect(result?.pages[0].items[0]).toMatchObject({
      id: "post-1",
      likeCount: 2,
      myReaction: "like",
    });
    expect(result?.pages[1].items[0]).toEqual(other);
  });

  it("passes undefined through", () => {
    expect(
      patchReactionInFeed(undefined, "post-1", {
        likeCount: 1,
        dislikeCount: 0,
        myReaction: "like",
      }),
    ).toBeUndefined();
  });

  it("does not mutate its input", () => {
    // A second, identical feed to compare against — not a JSON round-trip,
    // which would turn the `undefined` first pageParam into `null`.
    const feed = makeFeed([makePost()]);
    const untouched = makeFeed([makePost()]);
    patchReactionInFeed(feed, "post-1", {
      likeCount: 9,
      dislikeCount: 9,
      myReaction: "like",
    });
    expect(feed).toEqual(untouched);
  });
});

describe("writePostReaction", () => {
  it("updates the detail entry, the feed and every mine list, leaving other posts alone", () => {
    const queryClient = new QueryClient();
    const target = makePost({ id: "post-1", likeCount: 1 });
    const untouched = makePost({ id: "post-2", likeCount: 4 });

    queryClient.setQueryData(postKeys.detail("post-1"), target);
    queryClient.setQueryData<FeedData>(
      postKeys.feed(),
      makeFeed([target, untouched]),
    );
    queryClient.setQueryData<FeedData>(
      postKeys.mine("author-1"),
      makeFeed([target]),
    );
    queryClient.setQueryData<FeedData>(
      postKeys.mine("author-2"),
      makeFeed([untouched]),
    );

    writePostReaction(queryClient, "post-1", {
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });

    expect(
      queryClient.getQueryData<Post>(postKeys.detail("post-1")),
    ).toMatchObject({
      likeCount: 2,
      myReaction: "like",
    });

    const feed = queryClient.getQueryData<FeedData>(postKeys.feed());
    expect(feed?.pages[0].items[0]).toMatchObject({
      id: "post-1",
      likeCount: 2,
    });
    expect(feed?.pages[0].items[1]).toEqual(untouched);

    expect(
      queryClient.getQueryData<FeedData>(postKeys.mine("author-1"))?.pages[0]
        .items[0],
    ).toMatchObject({ likeCount: 2 });
    expect(
      queryClient.getQueryData<FeedData>(postKeys.mine("author-2"))?.pages[0]
        .items[0],
    ).toEqual(untouched);
  });
});

describe("snapshotPostCaches / restorePostCaches", () => {
  it("returns every entry to exactly its previous value", () => {
    const queryClient = new QueryClient();
    const target = makePost({ id: "post-1", likeCount: 1 });

    queryClient.setQueryData(postKeys.detail("post-1"), target);
    queryClient.setQueryData<FeedData>(postKeys.feed(), makeFeed([target]));
    queryClient.setQueryData<FeedData>(
      postKeys.mine("author-1"),
      makeFeed([target]),
    );

    const snapshot = snapshotPostCaches(queryClient, "post-1");

    writePostReaction(queryClient, "post-1", {
      likeCount: 99,
      dislikeCount: 99,
      myReaction: "dislike",
    });

    restorePostCaches(queryClient, snapshot);

    expect(queryClient.getQueryData(postKeys.detail("post-1"))).toEqual(target);
    expect(queryClient.getQueryData<FeedData>(postKeys.feed())).toEqual(
      makeFeed([target]),
    );
    expect(
      queryClient.getQueryData<FeedData>(postKeys.mine("author-1")),
    ).toEqual(makeFeed([target]));
  });
});
