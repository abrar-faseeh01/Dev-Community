import { postKeys } from "@/features/posts/queries/post-queries";
import type { Post } from "@/features/posts/types/post";
import { QueryClient } from "@tanstack/react-query";
import { commentKeys } from "../queries/comment-queries";
import type { Comment, CommentTree } from "../types/comment";
import {
  adjustPostCommentCount,
  patchCommentBody,
  replaceCommentReaction,
  restoreCommentTree,
  snapshotCommentTree,
  writeCommentReaction,
} from "./comment-cache-updates";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    title: "t",
    body: "b",
    likeCount: 0,
    dislikeCount: 0,
    commentCount: 3,
    myReaction: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: { id: "author-1", fullName: "Author", headline: null },
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    postId: "post-1",
    parentCommentId: null,
    body: "original",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    likeCount: 0,
    dislikeCount: 0,
    myReaction: null,
    author: { id: "author-1", fullName: "Author", headline: null },
    replies: [],
    ...overrides,
  };
}

describe("adjustPostCommentCount", () => {
  it("increments the cached post's commentCount", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      postKeys.detail("post-1"),
      makePost({ commentCount: 3 }),
    );

    adjustPostCommentCount(queryClient, "post-1", 1);

    expect(
      queryClient.getQueryData<Post>(postKeys.detail("post-1"))?.commentCount,
    ).toBe(4);
  });

  it("decrements by a cascade delete's deletedCount", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      postKeys.detail("post-1"),
      makePost({ commentCount: 3 }),
    );

    adjustPostCommentCount(queryClient, "post-1", -2);

    expect(
      queryClient.getQueryData<Post>(postKeys.detail("post-1"))?.commentCount,
    ).toBe(1);
  });

  it("clamps at 0 instead of going negative", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      postKeys.detail("post-1"),
      makePost({ commentCount: 3 }),
    );

    adjustPostCommentCount(queryClient, "post-1", -10);

    expect(
      queryClient.getQueryData<Post>(postKeys.detail("post-1"))?.commentCount,
    ).toBe(0);
  });

  it("does nothing when the post isn't cached", () => {
    const queryClient = new QueryClient();

    adjustPostCommentCount(queryClient, "post-1", 1);

    expect(
      queryClient.getQueryData<Post>(postKeys.detail("post-1")),
    ).toBeUndefined();
  });
});

describe("patchCommentBody", () => {
  it("patches a root comment's body and updatedAt in place", () => {
    const queryClient = new QueryClient();
    const tree: CommentTree = [makeComment({ id: "root-1" })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    patchCommentBody(
      queryClient,
      "post-1",
      "root-1",
      "edited",
      "2026-02-01T00:00:00.000Z",
    );

    const result = queryClient.getQueryData<CommentTree>(
      commentKeys.list("post-1"),
    );
    expect(result?.[0]).toMatchObject({
      id: "root-1",
      body: "edited",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("patches a flattened reply nested inside a root's replies", () => {
    const queryClient = new QueryClient();
    const reply = makeComment({
      id: "reply-1",
      parentCommentId: "root-1",
      body: "original reply",
    });
    const tree: CommentTree = [makeComment({ id: "root-1", replies: [reply] })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    patchCommentBody(
      queryClient,
      "post-1",
      "reply-1",
      "edited reply",
      "2026-02-01T00:00:00.000Z",
    );

    const result = queryClient.getQueryData<CommentTree>(
      commentKeys.list("post-1"),
    );
    expect(result?.[0].replies[0]).toMatchObject({
      id: "reply-1",
      body: "edited reply",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(result?.[0].body).toBe("original");
  });

  it("leaves the tree reference untouched when the id isn't found", () => {
    const queryClient = new QueryClient();
    const tree: CommentTree = [makeComment({ id: "root-1" })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    patchCommentBody(
      queryClient,
      "post-1",
      "does-not-exist",
      "edited",
      "2026-02-01T00:00:00.000Z",
    );

    expect(
      queryClient.getQueryData<CommentTree>(commentKeys.list("post-1")),
    ).toBe(tree);
  });

  it("does nothing when the tree isn't cached", () => {
    const queryClient = new QueryClient();

    patchCommentBody(
      queryClient,
      "post-1",
      "root-1",
      "edited",
      "2026-02-01T00:00:00.000Z",
    );

    expect(
      queryClient.getQueryData<CommentTree>(commentKeys.list("post-1")),
    ).toBeUndefined();
  });
});

describe("replaceCommentReaction", () => {
  it("patches a root comment's reaction fields", () => {
    const tree: CommentTree = [makeComment({ id: "root-1", likeCount: 1 })];

    const result = replaceCommentReaction(tree, "root-1", {
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });

    expect(result[0]).toMatchObject({
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });
  });

  it("patches a flattened reply nested inside a root's replies", () => {
    const reply = makeComment({ id: "reply-1", parentCommentId: "root-1" });
    const tree: CommentTree = [makeComment({ id: "root-1", replies: [reply] })];

    const result = replaceCommentReaction(tree, "reply-1", {
      likeCount: 0,
      dislikeCount: 1,
      myReaction: "dislike",
    });

    expect(result[0].replies[0]).toMatchObject({
      likeCount: 0,
      dislikeCount: 1,
      myReaction: "dislike",
    });
    // The root's own reaction fields are untouched.
    expect(result[0].likeCount).toBe(0);
  });

  it("returns the same array reference when the id isn't found", () => {
    const tree: CommentTree = [makeComment({ id: "root-1" })];

    const result = replaceCommentReaction(tree, "does-not-exist", {
      likeCount: 1,
      dislikeCount: 0,
      myReaction: "like",
    });

    expect(result).toBe(tree);
  });

  it("does not mutate its input", () => {
    const tree: CommentTree = [makeComment({ id: "root-1", likeCount: 1 })];
    const snapshot = JSON.parse(JSON.stringify(tree));

    replaceCommentReaction(tree, "root-1", {
      likeCount: 9,
      dislikeCount: 9,
      myReaction: "like",
    });

    expect(tree).toEqual(snapshot);
  });

  it("leaves siblings alone", () => {
    const sibling = makeComment({ id: "root-2", likeCount: 4 });
    const target = makeComment({ id: "root-1", likeCount: 1 });
    const tree: CommentTree = [target, sibling];

    const result = replaceCommentReaction(tree, "root-1", {
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });

    expect(result[1]).toEqual(sibling);
  });
});

describe("writeCommentReaction", () => {
  it("patches the cached tree via a real QueryClient", () => {
    const queryClient = new QueryClient();
    const tree: CommentTree = [makeComment({ id: "root-1", likeCount: 1 })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    writeCommentReaction(queryClient, "post-1", "root-1", {
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });

    expect(
      queryClient.getQueryData<CommentTree>(commentKeys.list("post-1"))?.[0],
    ).toMatchObject({ likeCount: 2, myReaction: "like" });
  });

  it("does nothing when the tree isn't cached", () => {
    const queryClient = new QueryClient();

    writeCommentReaction(queryClient, "post-1", "root-1", {
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });

    expect(
      queryClient.getQueryData<CommentTree>(commentKeys.list("post-1")),
    ).toBeUndefined();
  });
});

describe("snapshotCommentTree / restoreCommentTree", () => {
  it("returns the tree exactly as it was before a write", () => {
    const queryClient = new QueryClient();
    const tree: CommentTree = [makeComment({ id: "root-1", likeCount: 1 })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    const snapshot = snapshotCommentTree(queryClient, "post-1");

    writeCommentReaction(queryClient, "post-1", "root-1", {
      likeCount: 99,
      dislikeCount: 99,
      myReaction: "dislike",
    });

    restoreCommentTree(queryClient, "post-1", snapshot);

    expect(
      queryClient.getQueryData<CommentTree>(commentKeys.list("post-1")),
    ).toEqual(tree);
  });
});
