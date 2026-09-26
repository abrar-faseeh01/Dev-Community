import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types/user";
import type { ReactorList } from "@/features/reactions/types/reactor";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Comment } from "../types/comment";
import { CommentReactionSummary } from "./comment-reaction-summary";

// Same approach as post-reaction-summary.test.tsx: the service and useAuth are
// mocked, the real query hook, summary line and overlay run.
jest.mock("@/services/api/reactions");
jest.mock("@/features/auth/hooks/use-auth");
const { getCommentReactors: mockGetReactors } = jest.requireMock<{
  getCommentReactors: jest.MockedFunction<
    typeof import("@/services/api/reactions").getCommentReactors
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
    { user: { id: null, fullName: "Deleted user", headline: null }, type: "like" },
  ],
  likeCount: 2,
  dislikeCount: 1,
};
const DISLIKES: ReactorList = { ...ALL, items: [ALL.items[1]] };

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    postId: "post-1",
    parentCommentId: null,
    body: "body",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    likeCount: 2,
    dislikeCount: 1,
    myReaction: "like",
    author: { id: "author-1", fullName: "Author", headline: null },
    replies: [],
    ...overrides,
  };
}

function renderSummary(comment: Comment) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return render(<CommentReactionSummary comment={comment} />, {
    wrapper: Wrapper,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: VIEWER, loading: false });
  mockGetReactors.mockImplementation(async (_id, type) =>
    type === "dislike" ? DISLIKES : ALL,
  );
});

describe("CommentReactionSummary", () => {
  it("shows nothing for a comment nobody has reacted to", () => {
    const { container } = renderSummary(
      makeComment({ likeCount: 0, dislikeCount: 0, myReaction: null }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the summary line without fetching the list", async () => {
    renderSummary(makeComment());

    expect(
      screen.getByRole("button", { name: "You and 2 others reacted." }),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGetReactors).not.toHaveBeenCalled();
  });

  it("opens the overlay and fetches everyone, deleted accounts included", async () => {
    const user = userEvent.setup();
    renderSummary(makeComment());

    await user.click(screen.getByRole("button", { name: /reacted/ }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(3),
    );
    expect(mockGetReactors).toHaveBeenCalledWith("c1", undefined);
    expect(within(dialog).getByText("Deleted user")).toBeInTheDocument();
    expect(within(dialog).getByText("You")).toBeInTheDocument();
  });

  it("fetches a tab only when it is chosen", async () => {
    const user = userEvent.setup();
    renderSummary(makeComment());
    await user.click(screen.getByRole("button", { name: /reacted/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(3),
    );

    await user.click(within(dialog).getByRole("tab", { name: "Dislike 1" }));

    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(1),
    );
    expect(mockGetReactors).toHaveBeenLastCalledWith("c1", "dislike");
  });
});
