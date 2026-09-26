import { authKeys } from "@/features/auth/queries/auth-queries";
import type { AuthUser } from "@/features/auth/types/user";
import { usePostReaction } from "@/features/posts/mutations/post-mutations";
import type { ReactionResult } from "@/features/reactions/types/reaction-result";
import { ApiError } from "@/lib/axios/api-error";
import {
  toggleCommentReaction,
  togglePostReaction,
} from "@/services/api/reactions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { commentKeys } from "../queries/comment-queries";
import type { Comment, CommentTree } from "../types/comment";
import { useCommentReaction } from "./comment-mutations";

// Only the service is mocked; the real query client, cache helpers and hooks
// run. See post-reaction-mutation.test.tsx for the posts side.
jest.mock("@/services/api/reactions");
const mockToggleComment = toggleCommentReaction as jest.MockedFunction<
  typeof toggleCommentReaction
>;
const mockTogglePost = togglePostReaction as jest.MockedFunction<
  typeof togglePostReaction
>;

const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};
const OTHER_USER: AuthUser = {
  id: "u2",
  fullName: "Grace Hopper",
  email: "grace@example.com",
  role: "user",
};

const START: ReactionResult = { likeCount: 1, dislikeCount: 0, myReaction: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "root-1",
    postId: "post-1",
    parentCommentId: null,
    body: "body",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    likeCount: 1,
    dislikeCount: 0,
    myReaction: null,
    author: { id: "author-1", fullName: "Author", headline: null },
    replies: [],
    ...overrides,
  };
}

// One root with one reply, so both a root and a nested node can be targeted.
function makeTree(): CommentTree {
  return [
    makeComment({
      replies: [
        makeComment({ id: "reply-1", parentCommentId: "root-1" }),
      ],
    }),
  ];
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(authKeys.me, USER);
  queryClient.setQueryData<CommentTree>(commentKeys.list("post-1"), makeTree());

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

const tree = (qc: QueryClient) =>
  qc.getQueryData<CommentTree>(commentKeys.list("post-1"));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useCommentReaction", () => {
  it("updates a nested reply in the cached tree before the request returns", async () => {
    const call = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(
      () => useCommentReaction("post-1", "reply-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });

    await waitFor(() =>
      expect(tree(queryClient)?.[0].replies[0]).toMatchObject({
        likeCount: 2,
        myReaction: "like",
      }),
    );
    expect(result.current.isPending).toBe(true);
    // The parent comment is left alone.
    expect(tree(queryClient)?.[0]).toMatchObject({
      likeCount: 1,
      myReaction: null,
    });

    await act(async () => {
      call.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
  });

  it("replaces the optimistic guess with the server's counts on success", async () => {
    const call = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(
      () => useCommentReaction("post-1", "root-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(tree(queryClient)?.[0].likeCount).toBe(2));

    await act(async () => {
      call.resolve({ likeCount: 7, dislikeCount: 3, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(tree(queryClient)?.[0]).toMatchObject({
      likeCount: 7,
      dislikeCount: 3,
      myReaction: "like",
    });
  });

  it("restores the tree exactly as it was when the request fails", async () => {
    const call = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const before = tree(queryClient);
    const { result } = renderHook(
      () => useCommentReaction("post-1", "reply-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() =>
      expect(tree(queryClient)?.[0].replies[0].likeCount).toBe(2),
    );

    await act(async () => {
      call.reject(new ApiError("Internal error", [], 500));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(tree(queryClient)).toEqual(before);
  });

  it("marks the tree stale when the server says the comment no longer exists", async () => {
    const call = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useCommentReaction("post-1", "reply-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() =>
      expect(tree(queryClient)?.[0].replies[0].likeCount).toBe(2),
    );

    await act(async () => {
      call.reject(new ApiError("Comment not found", [], 404));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: commentKeys.list("post-1"),
    });
  });

  it("marks the tree stale on a 404 even while another reaction is still out", async () => {
    const gone = deferred<ReactionResult>();
    mockToggleComment
      .mockReturnValueOnce(gone.promise)
      .mockReturnValueOnce(new Promise(() => {}));
    const { queryClient, Wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => ({
        a: useCommentReaction("post-1", "reply-1"),
        b: useCommentReaction("post-1", "root-1"),
      }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.a.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(mockToggleComment).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.b.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(mockToggleComment).toHaveBeenCalledTimes(2));

    await act(async () => {
      gone.reject(new ApiError("Comment not found", [], 404));
    });
    await waitFor(() => expect(result.current.a.isError).toBe(true));

    // The second reaction is still out, so settling does not reconcile; this
    // invalidation can only be the error handler's own.
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: commentKeys.list("post-1"),
    });
  });

  it("does not write the server result into a new session's cache", async () => {
    const call = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(
      () => useCommentReaction("post-1", "root-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(tree(queryClient)?.[0].likeCount).toBe(2));

    act(() => {
      void queryClient.resetQueries({
        predicate: (q) => q.queryKey[0] !== authKeys.me[0],
      });
      queryClient.setQueryData(authKeys.me, OTHER_USER);
    });
    // The new session has already loaded its own copy of the thread.
    const theirs = [
      makeComment({ likeCount: 9, dislikeCount: 4, myReaction: "dislike" }),
    ];
    act(() => {
      queryClient.setQueryData<CommentTree>(commentKeys.list("post-1"), theirs);
    });

    await act(async () => {
      call.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(tree(queryClient)).toEqual(theirs);
  });

  it("cancels a read of the thread that is still in flight", async () => {
    const call = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    queryClient
      .fetchQuery({
        queryKey: commentKeys.list("post-1"),
        queryFn: () => new Promise<never>(() => {}),
        staleTime: 0,
      })
      .catch(() => undefined);
    await waitFor(() => expect(queryClient.isFetching()).toBe(1));
    const { result } = renderHook(
      () => useCommentReaction("post-1", "root-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    await act(async () => {
      call.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
  });

  it("does not restore the old tree after the signed-in user changed", async () => {
    const call = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(
      () => useCommentReaction("post-1", "reply-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() =>
      expect(tree(queryClient)?.[0].replies[0].likeCount).toBe(2),
    );

    act(() => {
      void queryClient.resetQueries({
        predicate: (q) => q.queryKey[0] !== authKeys.me[0],
      });
      queryClient.setQueryData(authKeys.me, OTHER_USER);
    });
    expect(tree(queryClient)).toBeUndefined();

    await act(async () => {
      call.reject(new ApiError("Internal error", [], 500));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(tree(queryClient)).toBeUndefined();
  });

  it("marks the tree stale once it settles", async () => {
    mockToggleComment.mockResolvedValue({
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });
    const { queryClient, Wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useCommentReaction("post-1", "root-1"),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: commentKeys.list("post-1"),
    });
  });

  // The two hooks live in different features but share one mutation key
  // prefix, so a comment reaction settling must see a post reaction that is
  // still in flight on the same page.
  it("does not reconcile while a post reaction is still in flight", async () => {
    const commentCall = deferred<ReactionResult>();
    const postCall = deferred<ReactionResult>();
    mockToggleComment.mockReturnValue(commentCall.promise);
    mockTogglePost.mockReturnValue(postCall.promise);
    const { queryClient, Wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => ({
        comment: useCommentReaction("post-1", "root-1"),
        post: usePostReaction("post-1"),
      }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.comment.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(mockToggleComment).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.post.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(mockTogglePost).toHaveBeenCalledTimes(1));

    await act(async () => {
      commentCall.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.comment.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      postCall.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.post.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalled();
  });
});
