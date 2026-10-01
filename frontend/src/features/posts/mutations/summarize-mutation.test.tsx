import { ApiError } from "@/lib/axios/api-error";
import { summarizePost } from "@/services/api/posts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { postKeys } from "../queries/post-queries";
import type { Post, PostSummary } from "../types/post";
import type { FeedData } from "../utils/post-cache";
import { useSummarizePost } from "./post-mutations";

// Only the service is mocked: the real query client and hook run.
jest.mock("@/services/api/posts");
const mockSummarize = summarizePost as jest.MockedFunction<
  typeof summarizePost
>;

const SUMMARY: PostSummary = {
  summary: "A short summary.",
  tags: ["React"],
  source: "mock",
  truncated: false,
};

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

function setup() {
  // No mutation defaults are set here, so the hook's own `retry: false` is
  // what the "never retries" test exercises.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(postKeys.detail("post-1"), makePost());
  queryClient.setQueryData<FeedData>(postKeys.feed("latest"), {
    pages: [{ items: [makePost()], nextCursor: null }],
    pageParams: [undefined],
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useSummarizePost", () => {
  it("calls the service with the post id and exposes the result as data", async () => {
    mockSummarize.mockResolvedValue(SUMMARY);
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSummarizePost("post-1"), {
      wrapper: Wrapper,
    });

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSummarize).toHaveBeenCalledWith("post-1");
    expect(result.current.data).toEqual(SUMMARY);
  });

  it("is pending while the request is in flight", async () => {
    const call = deferred<PostSummary>();
    mockSummarize.mockReturnValue(call.promise);
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSummarizePost("post-1"), {
      wrapper: Wrapper,
    });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => call.resolve(SUMMARY));
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("writes nothing to the post caches on success", async () => {
    mockSummarize.mockResolvedValue(SUMMARY);
    const { queryClient, Wrapper } = setup();
    const before = queryClient.getQueryCache().getAll().length;
    const { result } = renderHook(() => useSummarizePost("post-1"), {
      wrapper: Wrapper,
    });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryCache().getAll()).toHaveLength(before);
    expect(queryClient.getQueryData(postKeys.detail("post-1"))).toEqual(
      makePost(),
    );
  });

  it("never retries a failure on its own", async () => {
    mockSummarize.mockRejectedValue(new ApiError("down", [], 503));
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSummarizePost("post-1"), {
      wrapper: Wrapper,
    });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockSummarize).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeInstanceOf(ApiError);
  });

  it("can be tried again after a failure", async () => {
    mockSummarize
      .mockRejectedValueOnce(new ApiError("down", [], 503))
      .mockResolvedValueOnce(SUMMARY);
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSummarizePost("post-1"), {
      wrapper: Wrapper,
    });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SUMMARY);
    expect(mockSummarize).toHaveBeenCalledTimes(2);
  });

  it("removes the post from the feeds when the server says it is gone (404)", async () => {
    mockSummarize.mockRejectedValue(new ApiError("Post not found", [], 404));
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => useSummarizePost("post-1"), {
      wrapper: Wrapper,
    });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));

    const feed = queryClient.getQueryData<FeedData>(postKeys.feed("latest"));
    expect(feed?.pages[0].items).toEqual([]);
  });

  it.each([422, 503, 504, undefined])(
    "leaves the feeds alone for a %s failure",
    async (status) => {
      mockSummarize.mockRejectedValue(new ApiError("x", [], status));
      const { queryClient, Wrapper } = setup();
      const { result } = renderHook(() => useSummarizePost("post-1"), {
        wrapper: Wrapper,
      });

      act(() => result.current.mutate());
      await waitFor(() => expect(result.current.isError).toBe(true));

      const feed = queryClient.getQueryData<FeedData>(postKeys.feed("latest"));
      expect(feed?.pages[0].items).toHaveLength(1);
    },
  );
});
