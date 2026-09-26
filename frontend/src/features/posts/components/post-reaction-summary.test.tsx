import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types/user";
import type { ReactorList } from "@/features/reactions/types/reactor";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Post } from "../types/post";
import { PostReactionSummary } from "./post-reaction-summary";

// The service and useAuth are mocked; the real query hook, summary line and
// overlay run. The mocked function comes from requireMock because components
// (tests included) must not import the API layer, and lint enforces that.
jest.mock("@/services/api/reactions");
jest.mock("@/features/auth/hooks/use-auth");
const { getPostReactors: mockGetReactors } = jest.requireMock<{
  getPostReactors: jest.MockedFunction<
    typeof import("@/services/api/reactions").getPostReactors
  >;
}>("@/services/api/reactions");
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const VIEWER: AuthUser = {
  id: "u-ada",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};

const ALL: ReactorList = {
  items: [
    { user: { id: "u-ada", fullName: "Ada Lovelace" }, type: "like" },
    { user: { id: "u-grace", fullName: "Grace Hopper" }, type: "dislike" },
  ],
  likeCount: 1,
  dislikeCount: 1,
};
const LIKES: ReactorList = { ...ALL, items: [ALL.items[0]] };

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    title: "t",
    body: "b",
    likeCount: 1,
    dislikeCount: 1,
    commentCount: 0,
    myReaction: "like",
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: { id: "author-1", fullName: "Author", headline: null },
    ...overrides,
  };
}

function renderSummary(post: Post) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return render(<PostReactionSummary post={post} />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: VIEWER, loading: false });
  mockGetReactors.mockImplementation(async (_id, type) =>
    type === "like" ? LIKES : ALL,
  );
});

describe("PostReactionSummary", () => {
  it("shows nothing for a post nobody has reacted to", () => {
    const { container } = renderSummary(
      makePost({ likeCount: 0, dislikeCount: 0, myReaction: null }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the summary line without fetching the list", async () => {
    renderSummary(makePost());

    expect(
      screen.getByRole("button", { name: "You and 1 other reacted." }),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGetReactors).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the overlay and fetches everyone when the line is clicked", async () => {
    const user = userEvent.setup();
    renderSummary(makePost());

    await user.click(screen.getByRole("button", { name: /reacted/ }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(2),
    );
    expect(mockGetReactors).toHaveBeenCalledTimes(1);
    expect(mockGetReactors).toHaveBeenCalledWith("post-1", undefined);
    expect(within(dialog).getByText("Grace Hopper")).toBeInTheDocument();
    // The signed-in viewer's own row.
    expect(within(dialog).getByText("You")).toBeInTheDocument();
  });

  it("fetches a tab only when it is chosen", async () => {
    const user = userEvent.setup();
    renderSummary(makePost());
    await user.click(screen.getByRole("button", { name: /reacted/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(2),
    );

    await user.click(within(dialog).getByRole("tab", { name: "Like 1" }));

    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(1),
    );
    expect(mockGetReactors).toHaveBeenLastCalledWith("post-1", "like");
    expect(within(dialog).queryByText("Grace Hopper")).not.toBeInTheDocument();
  });

  it("reopens on the All tab", async () => {
    const user = userEvent.setup();
    renderSummary(makePost());
    await user.click(screen.getByRole("button", { name: /reacted/ }));
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "Like 1" }));

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reacted/ }));

    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("tab", { name: "All 2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows the error state and recovers on Retry", async () => {
    const user = userEvent.setup();
    mockGetReactors.mockRejectedValueOnce(new Error("boom"));
    renderSummary(makePost());

    await user.click(screen.getByRole("button", { name: /reacted/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(2),
    );
  });

  it("works signed out: the list is public", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderSummary(makePost({ myReaction: null }));

    await user.click(screen.getByRole("button", { name: "2 people reacted." }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(2),
    );
    expect(within(dialog).queryByText("You")).not.toBeInTheDocument();
  });
});
