import { QueryClient } from "@tanstack/react-query";
import { postKeys } from "../queries/post-queries";
import type { Post } from "../types/post";
import type { FeedData } from "./post-cache";
import {
  applyPostCreated,
  applyPostUpdate,
  forgetPost,
} from "./post-cache-updates";

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

const ids = (feed: FeedData | undefined) =>
  feed?.pages.flatMap((page) => page.items.map((post) => post.id));

function seeded() {
  const queryClient = new QueryClient();
  const a = makePost({ id: "a" });
  const b = makePost({ id: "b" });
  queryClient.setQueryData<FeedData>(postKeys.feed("latest"), makeFeed([a, b]));
  queryClient.setQueryData<FeedData>(postKeys.feed("top"), makeFeed([b, a]));
  queryClient.setQueryData<FeedData>(
    postKeys.feed("discussed"),
    makeFeed([b, a]),
  );
  queryClient.setQueryData<FeedData>(postKeys.mine("author-1"), makeFeed([a]));
  return { queryClient, a, b };
}

describe("applyPostCreated", () => {
  it("prepends into the latest feed only, not top or discussed", () => {
    const { queryClient } = seeded();
    const created = makePost({ id: "new" });

    applyPostCreated(queryClient, created);

    expect(
      ids(queryClient.getQueryData<FeedData>(postKeys.feed("latest"))),
    ).toEqual(["new", "a", "b"]);
    expect(
      ids(queryClient.getQueryData<FeedData>(postKeys.feed("top"))),
    ).toEqual(["b", "a"]);
    expect(
      ids(queryClient.getQueryData<FeedData>(postKeys.feed("discussed"))),
    ).toEqual(["b", "a"]);
  });

  it("does not create a feed entry for a sort that was never loaded", () => {
    const queryClient = new QueryClient();
    applyPostCreated(queryClient, makePost({ id: "new" }));
    expect(
      queryClient.getQueryCache().findAll({ queryKey: postKeys.feedAll() }),
    ).toHaveLength(0);
  });

  it("puts the post at the top of its author's list and seeds the detail entry", () => {
    const { queryClient } = seeded();
    const created = makePost({ id: "new" });

    applyPostCreated(queryClient, created);

    expect(
      ids(queryClient.getQueryData<FeedData>(postKeys.mine("author-1"))),
    ).toEqual(["new", "a"]);
    expect(queryClient.getQueryData(postKeys.detail("new"))).toEqual(created);
  });

  it("marks every sort's feed and every mine list stale", () => {
    const { queryClient } = seeded();
    applyPostCreated(queryClient, makePost({ id: "new" }));

    for (const sort of ["latest", "top", "discussed"] as const) {
      expect(
        queryClient.getQueryState(postKeys.feed(sort))?.isInvalidated,
      ).toBe(true);
    }
    expect(
      queryClient.getQueryState(postKeys.mine("author-1"))?.isInvalidated,
    ).toBe(true);
  });
});

describe("applyPostUpdate", () => {
  it("patches the post under every cached sort and in the author's list", () => {
    const { queryClient } = seeded();
    const updated = makePost({ id: "a", title: "edited" });

    applyPostUpdate(queryClient, updated);

    for (const sort of ["latest", "top", "discussed"] as const) {
      const items = queryClient
        .getQueryData<FeedData>(postKeys.feed(sort))
        ?.pages[0].items.filter((post) => post.id === "a");
      expect(items).toEqual([updated]);
    }
    expect(
      queryClient.getQueryData<FeedData>(postKeys.mine("author-1"))?.pages[0]
        .items[0],
    ).toEqual(updated);
    expect(queryClient.getQueryData(postKeys.detail("a"))).toEqual(updated);
  });

  it("leaves the other posts and the order alone in each sort", () => {
    const { queryClient, b } = seeded();
    applyPostUpdate(queryClient, makePost({ id: "a", title: "edited" }));

    const top = queryClient.getQueryData<FeedData>(postKeys.feed("top"));
    expect(ids(top)).toEqual(["b", "a"]);
    expect(top?.pages[0].items[0]).toEqual(b);
  });
});

describe("forgetPost", () => {
  it("removes the post from every cached sort and from mine, keeping the rest", () => {
    const { queryClient } = seeded();

    forgetPost(queryClient, "a");

    for (const sort of ["latest", "top", "discussed"] as const) {
      expect(
        ids(queryClient.getQueryData<FeedData>(postKeys.feed(sort))),
      ).toEqual(["b"]);
    }
    expect(
      ids(queryClient.getQueryData<FeedData>(postKeys.mine("author-1"))),
    ).toEqual([]);
  });

  it("drops an unobserved detail entry", () => {
    const { queryClient, a } = seeded();
    queryClient.setQueryData(postKeys.detail("a"), a);

    forgetPost(queryClient, "a");

    expect(queryClient.getQueryData(postKeys.detail("a"))).toBeUndefined();
  });
});
