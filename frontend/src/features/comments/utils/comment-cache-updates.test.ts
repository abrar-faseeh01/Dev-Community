import { QueryClient } from "@tanstack/react-query";
import { postKeys } from "@/features/posts/queries/post-queries";
import type { Post } from "@/features/posts/types/post";
import { commentKeys } from "../queries/comment-queries";
import type { Comment, CommentTree } from "../types/comment";
import { adjustPostCommentCount, patchCommentBody } from "./comment-cache-updates";

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
    queryClient.setQueryData(postKeys.detail("post-1"), makePost({ commentCount: 3 }));

    adjustPostCommentCount(queryClient, "post-1", 1);

    expect(queryClient.getQueryData<Post>(postKeys.detail("post-1"))?.commentCount).toBe(4);
  });

  it("decrements by a cascade delete's deletedCount", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(postKeys.detail("post-1"), makePost({ commentCount: 3 }));

    adjustPostCommentCount(queryClient, "post-1", -2);

    expect(queryClient.getQueryData<Post>(postKeys.detail("post-1"))?.commentCount).toBe(1);
  });

  it("clamps at 0 instead of going negative", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(postKeys.detail("post-1"), makePost({ commentCount: 3 }));

    adjustPostCommentCount(queryClient, "post-1", -10);

    expect(queryClient.getQueryData<Post>(postKeys.detail("post-1"))?.commentCount).toBe(0);
  });

  it("does nothing when the post isn't cached", () => {
    const queryClient = new QueryClient();

    adjustPostCommentCount(queryClient, "post-1", 1);

    expect(queryClient.getQueryData<Post>(postKeys.detail("post-1"))).toBeUndefined();
  });
});

describe("patchCommentBody", () => {
  it("patches a root comment's body and updatedAt in place", () => {
    const queryClient = new QueryClient();
    const tree: CommentTree = [makeComment({ id: "root-1" })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    patchCommentBody(queryClient, "post-1", "root-1", "edited", "2026-02-01T00:00:00.000Z");

    const result = queryClient.getQueryData<CommentTree>(commentKeys.list("post-1"));
    expect(result?.[0]).toMatchObject({
      id: "root-1",
      body: "edited",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("patches a flattened reply nested inside a root's replies", () => {
    const queryClient = new QueryClient();
    const reply = makeComment({ id: "reply-1", parentCommentId: "root-1", body: "original reply" });
    const tree: CommentTree = [makeComment({ id: "root-1", replies: [reply] })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    patchCommentBody(queryClient, "post-1", "reply-1", "edited reply", "2026-02-01T00:00:00.000Z");

    const result = queryClient.getQueryData<CommentTree>(commentKeys.list("post-1"));
    expect(result?.[0].replies[0]).toMatchObject({
      id: "reply-1",
      body: "edited reply",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    // The root itself is otherwise untouched.
    expect(result?.[0].body).toBe("original");
  });

  it("leaves the tree reference untouched when the id isn't found", () => {
    const queryClient = new QueryClient();
    const tree: CommentTree = [makeComment({ id: "root-1" })];
    queryClient.setQueryData(commentKeys.list("post-1"), tree);

    patchCommentBody(queryClient, "post-1", "does-not-exist", "edited", "2026-02-01T00:00:00.000Z");

    expect(queryClient.getQueryData<CommentTree>(commentKeys.list("post-1"))).toBe(tree);
  });

  it("does nothing when the tree isn't cached", () => {
    const queryClient = new QueryClient();

    patchCommentBody(queryClient, "post-1", "root-1", "edited", "2026-02-01T00:00:00.000Z");

    expect(queryClient.getQueryData<CommentTree>(commentKeys.list("post-1"))).toBeUndefined();
  });
});
