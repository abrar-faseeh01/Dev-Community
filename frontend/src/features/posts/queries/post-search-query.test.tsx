import type { PostSearchPage } from "@/features/posts/types/post";
import { searchPosts } from "@/services/api/posts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { postKeys, useSearchPosts } from "./post-queries";

jest.mock("@/services/api/posts");
const mockSearchPosts = searchPosts as jest.MockedFunction<typeof searchPosts>;

const PAGE: PostSearchPage = { items: [], hasMore: false };

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
  mockSearchPosts.mockResolvedValue(PAGE);
});

describe("postKeys search keys", () => {
  it("gives each term its own entry, under the search prefix", () => {
    expect(postKeys.searchAll()).toEqual(["posts", "search"]);
    expect(postKeys.search("react")).toEqual(["posts", "search", "react"]);
    expect(postKeys.search("react")).not.toEqual(postKeys.search("vue"));
  });

  it("keeps the search prefix apart from feed, detail, mine and reactors", () => {
    const prefix = postKeys.searchAll();
    for (const other of [
      postKeys.feed("latest"),
      postKeys.detail("p1"),
      postKeys.mine("u1"),
      postKeys.reactors("p1", "all"),
    ]) {
      expect(other.slice(0, 2)).not.toEqual([...prefix]);
    }
  });
});

describe("useSearchPosts", () => {
  it("does not fetch for an empty term", () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSearchPosts(""), {
      wrapper: Wrapper,
    });
    expect(mockSearchPosts).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("searches for exactly the given term with an abort signal, and caches under it", async () => {
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => useSearchPosts("react"), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSearchPosts).toHaveBeenCalledTimes(1);
    expect(mockSearchPosts).toHaveBeenCalledWith({
      q: "react",
      signal: expect.any(AbortSignal),
    });
    expect(queryClient.getQueryData(postKeys.search("react"))).toEqual(PAGE);
  });

  it("keeps two terms in two cache entries", async () => {
    const { queryClient, Wrapper } = setup();
    const other: PostSearchPage = { items: [], hasMore: true };
    mockSearchPosts.mockImplementation(async ({ q }) =>
      q === "vue" ? other : PAGE,
    );

    const { result, rerender } = renderHook(
      ({ term }) => useSearchPosts(term),
      { wrapper: Wrapper, initialProps: { term: "react" } },
    );
    await waitFor(() => expect(result.current.data).toEqual(PAGE));

    rerender({ term: "vue" });
    await waitFor(() => expect(result.current.data).toEqual(other));

    expect(queryClient.getQueryData(postKeys.search("react"))).toEqual(PAGE);
    expect(queryClient.getQueryData(postKeys.search("vue"))).toEqual(other);
  });

  it("shows no data for a term that has none yet, not the previous term's", async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ term }) => useSearchPosts(term),
      { wrapper: Wrapper, initialProps: { term: "react" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ term: "" });
    expect(result.current.data).toBeUndefined();
  });
});
