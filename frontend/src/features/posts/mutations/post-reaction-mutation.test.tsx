import { authKeys } from "@/features/auth/queries/auth-queries";
import type { AuthUser } from "@/features/auth/types/user";
import type { ReactionResult } from "@/features/reactions/types/reaction-result";
import { ApiError } from "@/lib/axios/api-error";
import { togglePostReaction } from "@/services/api/reactions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { postKeys } from "../queries/post-queries";
import type { Post } from "../types/post";
import type { FeedData } from "../utils/post-cache";
import { usePostReaction } from "./post-mutations";

// Only the service is mocked: the real query client, cache helpers and hook
// run, so these tests cover the actual optimistic write, rollback and
// reconcile behaviour rather than a scripted copy of it.
jest.mock("@/services/api/reactions");
const mockToggle = togglePostReaction as jest.MockedFunction<
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

// A request the test settles by hand, so it can look at the cache while the
// request is still "in flight".
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    title: "t",
    body: "b",
    likeCount: 1,
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

function feedOf(posts: Post[]): FeedData {
  return {
    pages: [{ items: posts, nextCursor: null }],
    pageParams: [undefined],
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(authKeys.me, USER);
  queryClient.setQueryData(postKeys.detail("post-1"), makePost());
  queryClient.setQueryData<FeedData>(
    postKeys.feed(),
    feedOf([makePost(), makePost({ id: "post-2", likeCount: 4 })]),
  );
  queryClient.setQueryData<FeedData>(
    postKeys.mine("author-1"),
    feedOf([makePost()]),
  );

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

const detail = (qc: QueryClient) =>
  qc.getQueryData<Post>(postKeys.detail("post-1"));
const feed = (qc: QueryClient) => qc.getQueryData<FeedData>(postKeys.feed());
const mine = (qc: QueryClient) =>
  qc.getQueryData<FeedData>(postKeys.mine("author-1"));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("usePostReaction", () => {
  it("updates the detail, feed and mine caches before the request returns", async () => {
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });

    await waitFor(() =>
      expect(detail(queryClient)).toMatchObject({
        likeCount: 2,
        myReaction: "like",
      }),
    );
    // Still in flight: nothing has come back from the server yet.
    expect(result.current.isPending).toBe(true);
    expect(feed(queryClient)?.pages[0].items[0]).toMatchObject({
      id: "post-1",
      likeCount: 2,
      myReaction: "like",
    });
    expect(mine(queryClient)?.pages[0].items[0]).toMatchObject({
      likeCount: 2,
      myReaction: "like",
    });
    // A different post in the same feed is left alone.
    expect(feed(queryClient)?.pages[0].items[1]).toMatchObject({
      id: "post-2",
      likeCount: 4,
      myReaction: null,
    });

    await act(async () => {
      call.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
  });

  it("replaces the optimistic guess with the server's counts on success", async () => {
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(detail(queryClient)?.likeCount).toBe(2));

    // Someone else reacted too, so the server's numbers differ from the guess.
    await act(async () => {
      call.resolve({ likeCount: 5, dislikeCount: 2, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(detail(queryClient)).toMatchObject({
      likeCount: 5,
      dislikeCount: 2,
      myReaction: "like",
    });
    expect(feed(queryClient)?.pages[0].items[0]).toMatchObject({
      likeCount: 5,
      dislikeCount: 2,
    });
    expect(mine(queryClient)?.pages[0].items[0]).toMatchObject({
      likeCount: 5,
      dislikeCount: 2,
    });
  });

  it("restores every cache exactly as it was when the request fails", async () => {
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const before = {
      detail: detail(queryClient),
      feed: feed(queryClient),
      mine: mine(queryClient),
    };
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(detail(queryClient)?.likeCount).toBe(2));

    await act(async () => {
      call.reject(new ApiError("Internal error", [], 500));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(detail(queryClient)).toEqual(before.detail);
    expect(feed(queryClient)).toEqual(before.feed);
    expect(mine(queryClient)).toEqual(before.mine);
  });

  it("drops the post from the caches when the server says it no longer exists", async () => {
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(detail(queryClient)?.likeCount).toBe(2));

    await act(async () => {
      call.reject(new ApiError("Post not found", [], 404));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(detail(queryClient)).toBeUndefined();
    expect(feed(queryClient)?.pages[0].items.map((p) => p.id)).toEqual([
      "post-2",
    ]);
  });

  it("does not restore the old snapshot after the signed-in user changed", async () => {
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(detail(queryClient)?.likeCount).toBe(2));

    // What useChangeSession does on a login or logout while the request is
    // still out: everything but the auth entry is cleared, then the new user
    // is written.
    act(() => {
      void queryClient.resetQueries({
        predicate: (q) => q.queryKey[0] !== authKeys.me[0],
      });
      queryClient.setQueryData(authKeys.me, OTHER_USER);
    });
    expect(detail(queryClient)).toBeUndefined();

    await act(async () => {
      call.reject(new ApiError("Internal error", [], 500));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The rollback must not put the first user's data back.
    expect(detail(queryClient)).toBeUndefined();
    expect(feed(queryClient)).toBeUndefined();
    expect(mine(queryClient)).toBeUndefined();
  });

  it("does not write the server result into a new session's cache", async () => {
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(detail(queryClient)?.likeCount).toBe(2));

    act(() => {
      void queryClient.resetQueries({
        predicate: (q) => q.queryKey[0] !== authKeys.me[0],
      });
      queryClient.setQueryData(authKeys.me, OTHER_USER);
    });

    // The new session has already loaded its own copy of the post.
    const theirs = makePost({
      likeCount: 9,
      dislikeCount: 4,
      myReaction: "dislike",
    });
    act(() => {
      queryClient.setQueryData(postKeys.detail("post-1"), theirs);
    });

    await act(async () => {
      call.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The first user's late answer must not overwrite it.
    expect(detail(queryClient)).toEqual(theirs);
  });

  it("cancels reads still in flight for the caches it is about to write", async () => {
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    const { queryClient, Wrapper } = setup();
    // A refetch of each cache is out when the user reacts. If it landed after
    // the optimistic write it would put older numbers back on screen.
    const never = () => new Promise<never>(() => {});
    for (const queryKey of [
      postKeys.detail("post-1"),
      postKeys.feed(),
      postKeys.mine("author-1"),
    ]) {
      queryClient
        .fetchQuery({ queryKey, queryFn: never, staleTime: 0 })
        .catch(() => undefined);
    }
    await waitFor(() => expect(queryClient.isFetching()).toBe(3));
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    await act(async () => {
      call.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
  });

  it("marks the detail, feed and mine caches stale once it settles", async () => {
    mockToggle.mockResolvedValue({
      likeCount: 2,
      dislikeCount: 0,
      myReaction: "like",
    });
    const { queryClient, Wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => usePostReaction("post-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: postKeys.detail("post-1"),
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: postKeys.feed() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: postKeys.mineAll() });
  });

  it("reconciles only when the last of several in-flight reactions settles", async () => {
    const first = deferred<ReactionResult>();
    const second = deferred<ReactionResult>();
    mockToggle
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { queryClient, Wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => ({ a: usePostReaction("post-1"), b: usePostReaction("post-2") }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.a.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(mockToggle).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.b.mutate({ type: "like", current: START });
    });
    await waitFor(() => expect(mockToggle).toHaveBeenCalledTimes(2));

    // The first settles while the second is still out: no refetch yet, which
    // would overwrite the second one's optimistic write.
    await act(async () => {
      first.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.a.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve({ likeCount: 2, dislikeCount: 0, myReaction: "like" });
    });
    await waitFor(() => expect(result.current.b.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalled();
  });
});
