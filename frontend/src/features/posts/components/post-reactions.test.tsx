import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types/user";
import type { ReactionResult } from "@/features/reactions/types/reaction-result";
import { ApiError } from "@/lib/axios/api-error";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Post } from "../types/post";
import { PostReactions } from "./post-reactions";

// The service and useAuth are mocked; the real hook, cache and buttons run,
// so this covers the wiring between them (mode, pending lock, error message).
// The mocked function is fetched with requireMock rather than imported:
// components (tests included) must not import the API layer, and lint enforces
// that.
jest.mock("@/services/api/reactions");
jest.mock("@/features/auth/hooks/use-auth");
const { togglePostReaction: mockToggle } = jest.requireMock<{
  togglePostReaction: jest.MockedFunction<
    typeof import("@/services/api/reactions").togglePostReaction
  >;
}>("@/services/api/reactions");
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};
const ADMIN: AuthUser = { ...USER, id: "a1", role: "admin" };

const POST: Post = {
  id: "post-1",
  title: "t",
  body: "b",
  likeCount: 2,
  dislikeCount: 1,
  commentCount: 0,
  myReaction: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  author: { id: "author-1", fullName: "Author", headline: null },
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

function renderReactions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return render(<PostReactions post={POST} />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: USER, loading: false });
});

describe("PostReactions", () => {
  it("sends one request for repeated clicks while the first is in flight", async () => {
    const user = userEvent.setup();
    const call = deferred<ReactionResult>();
    mockToggle.mockReturnValue(call.promise);
    renderReactions();

    const like = screen.getByRole("button", { name: "Like, 2" });
    await user.click(like);
    await waitFor(() => expect(like).toHaveAttribute("aria-disabled", "true"));

    await user.click(like);
    await user.click(screen.getByRole("button", { name: "Dislike, 1" }));

    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle).toHaveBeenCalledWith("post-1", "like");

    // Once it settles the control works again.
    await act(async () => {
      call.resolve({ likeCount: 3, dislikeCount: 1, myReaction: "like" });
    });
    await waitFor(() => expect(like).not.toHaveAttribute("aria-disabled"));
  });

  it("sends one request even for two clicks in the same tick", async () => {
    mockToggle.mockReturnValue(new Promise(() => {}));
    renderReactions();

    const like = screen.getByRole("button", { name: "Like, 2" });
    // No awaiting between them: the second click lands before React has
    // re-rendered with the pending state.
    fireEvent.click(like);
    fireEvent.click(like);

    // The service is called after onMutate's awaits, so let those finish
    // before counting.
    await waitFor(() => expect(mockToggle).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("lets a different post be reacted to while one is still in flight", async () => {
    const user = userEvent.setup();
    mockToggle.mockReturnValue(new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <PostReactions post={POST} />
        <PostReactions post={{ ...POST, id: "post-2", likeCount: 7 }} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Like, 2" }));
    await waitFor(() => expect(mockToggle).toHaveBeenCalledTimes(1));
    // The first post is still out; the second is a different target.
    await user.click(screen.getByRole("button", { name: "Like, 7" }));

    await waitFor(() => expect(mockToggle).toHaveBeenCalledTimes(2));
    expect(mockToggle).toHaveBeenNthCalledWith(2, "post-2", "like");
  });

  it("shows a message when the request fails and clears it on the next click", async () => {
    const user = userEvent.setup();
    mockToggle.mockRejectedValueOnce(new ApiError("Internal error", [], 500));
    renderReactions();

    await user.click(screen.getByRole("button", { name: "Like, 2" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't save your reaction. Please try again.",
      ),
    );

    mockToggle.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Like, 2" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(""));
  });

  it("signed out: a click sends nothing and offers the sign-in link", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderReactions();

    await user.click(screen.getByRole("button", { name: "Like, 2" }));

    expect(mockToggle).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("admin: counts only, no buttons", () => {
    mockUseAuth.mockReturnValue({ user: ADMIN, loading: false });
    renderReactions();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("read-only while auth is still loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderReactions();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
