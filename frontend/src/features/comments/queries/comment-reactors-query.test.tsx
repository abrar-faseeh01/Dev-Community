import type { ReactorList } from "@/features/reactions/types/reactor";
import { getCommentReactors } from "@/services/api/reactions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { commentKeys, useCommentReactors } from "./comment-queries";

jest.mock("@/services/api/reactions");
const mockGetReactors = getCommentReactors as jest.MockedFunction<
  typeof getCommentReactors
>;

const LIST: ReactorList = {
  items: [{ user: { id: "u1", fullName: "Ada Lovelace" }, type: "dislike" }],
  likeCount: 0,
  dislikeCount: 1,
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
  return { Wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReactors.mockResolvedValue(LIST);
});

describe("commentKeys.reactors", () => {
  it("gives each tab of each comment its own entry, apart from the thread's own list", () => {
    expect(commentKeys.reactors("c1", "all")).not.toEqual(
      commentKeys.reactors("c1", "dislike"),
    );
    expect(commentKeys.reactors("c1", "all")).not.toEqual(
      commentKeys.reactors("c2", "all"),
    );
    expect(commentKeys.reactors("c1", "all")).not.toEqual(
      commentKeys.list("c1"),
    );
  });
});

describe("useCommentReactors", () => {
  it("does not fetch anything while the overlay is closed", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => useCommentReactors("c1", "all", false),
      { wrapper: Wrapper },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockGetReactors).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches everyone on the All tab, with no type filter", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useCommentReactors("c1", "all", true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetReactors).toHaveBeenCalledWith("c1", undefined);
    expect(result.current.data).toEqual(LIST);
  });

  it.each(["like", "dislike"] as const)(
    "asks the server for only %s on that tab",
    async (tab) => {
      const { Wrapper } = setup();
      const { result } = renderHook(() => useCommentReactors("c1", tab, true), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGetReactors).toHaveBeenCalledWith("c1", tab);
    },
  );

  it("starts fetching when the overlay opens, not before", async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ open }) => useCommentReactors("c1", "all", open),
      { wrapper: Wrapper, initialProps: { open: false } },
    );
    expect(mockGetReactors).not.toHaveBeenCalled();

    rerender({ open: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReactors).toHaveBeenCalledTimes(1);
  });

  it("refetches on the next open, because a cached list is already stale", async () => {
    const { Wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ open }) => useCommentReactors("c1", "all", open),
      { wrapper: Wrapper, initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ open: false });
    rerender({ open: true });

    await waitFor(() => expect(mockGetReactors).toHaveBeenCalledTimes(2));
  });
});
