import type { PostPage } from "@/features/posts/types/post";
import { getPostPage } from "@/services/api/posts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { postKeys, useMyPosts, usePostFeed } from "./post-queries";

jest.mock("@/services/api/posts");
const mockGetPostPage = getPostPage as jest.MockedFunction<typeof getPostPage>;

const PAGE: PostPage = { items: [], nextCursor: null };

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
  mockGetPostPage.mockResolvedValue(PAGE);
});

describe("postKeys feed keys", () => {
  it("gives each sort its own entry", () => {
    const keys = (["latest", "top", "discussed"] as const).map((s) =>
      JSON.stringify(postKeys.feed(s)),
    );
    expect(new Set(keys).size).toBe(3);
  });

  it("nests every sort under feedAll, which sits under posts", () => {
    expect(postKeys.feedAll()).toEqual(["posts", "feed"]);
    expect(postKeys.feed("top")).toEqual(["posts", "feed", "top"]);
    expect(postKeys.feed("top").slice(0, 2)).toEqual([...postKeys.feedAll()]);
  });

  it("keeps the feed prefix apart from detail, mine and reactors", () => {
    const prefix = postKeys.feedAll();
    for (const other of [
      postKeys.detail("p1"),
      postKeys.mine("u1"),
      postKeys.reactors("p1", "all"),
    ]) {
      expect(other.slice(0, 2)).not.toEqual([...prefix]);
    }
  });
});

describe("usePostFeed", () => {
  it("requests the given sort and caches under that sort's key only", async () => {
    const { queryClient, Wrapper } = setup();
    const { result } = renderHook(() => usePostFeed("top"), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetPostPage).toHaveBeenCalledWith({
      cursor: undefined,
      sort: "top",
    });
    expect(queryClient.getQueryData(postKeys.feed("top"))).toBeDefined();
    expect(queryClient.getQueryData(postKeys.feed("latest"))).toBeUndefined();
    expect(
      queryClient.getQueryData(postKeys.feed("discussed")),
    ).toBeUndefined();
  });

  it("keeps two sorts as separate entries that a feedAll prefix reaches together", async () => {
    const { queryClient, Wrapper } = setup();
    const top = renderHook(() => usePostFeed("top"), { wrapper: Wrapper });
    const latest = renderHook(() => usePostFeed("latest"), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(top.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(latest.result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueriesData({ queryKey: postKeys.feedAll() });
    expect(cached.map(([key]) => key[2]).sort()).toEqual(["latest", "top"]);
  });

  it("passes the next page's cursor along with the same sort", async () => {
    mockGetPostPage
      .mockResolvedValueOnce({ items: [], nextCursor: "c1" })
      .mockResolvedValueOnce(PAGE);
    const { Wrapper } = setup();
    const { result } = renderHook(() => usePostFeed("discussed"), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await result.current.fetchNextPage();

    expect(mockGetPostPage).toHaveBeenLastCalledWith({
      cursor: "c1",
      sort: "discussed",
    });
  });
});

describe("useMyPosts", () => {
  it("filters by author and sends no sort", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useMyPosts("u1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetPostPage).toHaveBeenCalledWith({
      cursor: undefined,
      authorId: "u1",
    });
  });
});
