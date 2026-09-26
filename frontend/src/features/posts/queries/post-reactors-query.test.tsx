import type { ReactorList } from "@/features/reactions/types/reactor";
import { getPostReactors } from "@/services/api/reactions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { postKeys, usePostReactors } from "./post-queries";

jest.mock("@/services/api/reactions");
const mockGetReactors = getPostReactors as jest.MockedFunction<
  typeof getPostReactors
>;

const LIST: ReactorList = {
  items: [{ user: { id: "u1", fullName: "Ada Lovelace" }, type: "like" }],
  likeCount: 1,
  dislikeCount: 0,
};

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
  mockGetReactors.mockResolvedValue(LIST);
});

describe("postKeys.reactors", () => {
  it("gives each tab of each post its own entry, under the posts prefix", () => {
    expect(postKeys.reactors("p1", "all")).not.toEqual(
      postKeys.reactors("p1", "like"),
    );
    expect(postKeys.reactors("p1", "all")).not.toEqual(
      postKeys.reactors("p2", "all"),
    );
    expect(postKeys.reactors("p1", "all").slice(0, postKeys.all.length)).toEqual(
      postKeys.all,
    );
  });
});

describe("usePostReactors", () => {
  it("does not fetch anything while the overlay is closed", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => usePostReactors("p1", "all", false), {
      wrapper: Wrapper,
    });

    // Give a request every chance to start.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockGetReactors).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("fetches everyone when opened on the All tab, with no type filter", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => usePostReactors("p1", "all", true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetReactors).toHaveBeenCalledTimes(1);
    expect(mockGetReactors).toHaveBeenCalledWith("p1", undefined);
    expect(result.current.data).toEqual(LIST);
  });

  it.each(["like", "dislike"] as const)(
    "asks the server for only %s on that tab",
    async (tab) => {
      const { Wrapper } = setup();
      const { result } = renderHook(() => usePostReactors("p1", tab, true), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGetReactors).toHaveBeenCalledWith("p1", tab);
    },
  );

  it("starts fetching when the overlay opens, not before", async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ open }) => usePostReactors("p1", "all", open),
      { wrapper: Wrapper, initialProps: { open: false } },
    );
    expect(mockGetReactors).not.toHaveBeenCalled();

    rerender({ open: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReactors).toHaveBeenCalledTimes(1);
  });

  it("fetches a tab once, each tab separately", async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ tab }) => usePostReactors("p1", tab, true),
      { wrapper: Wrapper, initialProps: { tab: "all" as "all" | "like" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ tab: "like" });
    await waitFor(() =>
      expect(mockGetReactors).toHaveBeenLastCalledWith("p1", "like"),
    );

    expect(mockGetReactors).toHaveBeenCalledTimes(2);
  });

  it("refetches on the next open, because a cached list is already stale", async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ open }) => usePostReactors("p1", "all", open),
      { wrapper: Wrapper, initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReactors).toHaveBeenCalledTimes(1);

    rerender({ open: false });
    rerender({ open: true });

    await waitFor(() => expect(mockGetReactors).toHaveBeenCalledTimes(2));
  });

  it("reports a failure", async () => {
    mockGetReactors.mockRejectedValue(new Error("boom"));
    const { Wrapper } = setup();
    const { result } = renderHook(() => usePostReactors("p1", "all", true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
