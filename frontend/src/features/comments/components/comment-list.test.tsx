import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CommentTree } from "@/features/comments/types/comment";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useComments } from "@/features/comments/queries/comment-queries";
import {
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from "@/features/comments/mutations/comment-mutations";
import { CommentList } from "./comment-list";

// Mocking the query/mutation hooks and useAuth, not the API/service layer
// underneath them — components (and their tests) may only reach the API
// through a hook, enforced by eslint.config.mjs's no-restricted-imports rule
// for src/features/*/components. useDeleteComment and useQueryClient are
// called directly inside CommentItem (unlike reply/update, which arrive as
// props), so this suite also needs a real QueryClientProvider — see
// renderCommentList below.
jest.mock("@/features/comments/queries/comment-queries");
jest.mock("@/features/comments/mutations/comment-mutations");
jest.mock("@/features/auth/hooks/use-auth");

const mockUseComments = useComments as jest.MockedFunction<typeof useComments>;
const mockUseCreateComment = useCreateComment as jest.MockedFunction<
  typeof useCreateComment
>;
const mockUseUpdateComment = useUpdateComment as jest.MockedFunction<
  typeof useUpdateComment
>;
const mockUseDeleteComment = useDeleteComment as jest.MockedFunction<
  typeof useDeleteComment
>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function renderCommentList(props: { commentCount: number }) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CommentList postId="post-1" postAuthorId={POST_AUTHOR_ID} {...props} />
    </QueryClientProvider>,
  );
}

const POST_AUTHOR_ID = "post-owner-1";

type CommentsResult = ReturnType<typeof useComments>;

function pendingComments(): CommentsResult {
  return { isPending: true, isError: false, isFetching: true } as CommentsResult;
}
function errorComments(): CommentsResult {
  return {
    isPending: false,
    isError: true,
    isFetching: false,
    error: new Error("network down"),
    refetch: jest.fn(),
  } as unknown as CommentsResult;
}
function successComments(data: CommentTree): CommentsResult {
  return { isPending: false, isError: false, isFetching: false, data } as CommentsResult;
}

function fakeMutation(overrides: Partial<ReturnType<typeof useCreateComment>> = {}) {
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useCreateComment>;
}

function fakeUpdateMutation(overrides: Partial<ReturnType<typeof useUpdateComment>> = {}) {
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useUpdateComment>;
}

function fakeDeleteMutation(overrides: Partial<ReturnType<typeof useDeleteComment>> = {}) {
  return {
    isPending: false,
    isError: false,
    error: null,
    reset: jest.fn(),
    mutateAsync: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDeleteComment>;
}

const TREE: CommentTree = [
  {
    id: "c1",
    postId: "post-1",
    parentCommentId: null,
    body: "first comment",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: { id: "author-1", fullName: "Ada Lovelace", headline: null },
    replies: [],
  },
];

const TWO_COMMENT_TREE: CommentTree = [
  {
    id: "c1",
    postId: "post-1",
    parentCommentId: null,
    body: "first comment",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: { id: "author-1", fullName: "Ada Lovelace", headline: null },
    replies: [],
  },
  {
    id: "c2",
    postId: "post-1",
    parentCommentId: null,
    body: "second comment",
    createdAt: "2026-01-01T00:01:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    author: { id: "author-2", fullName: "Grace Hopper", headline: null },
    replies: [],
  },
];

const LOGGED_IN_USER = {
  user: { id: "viewer-1", fullName: "Viewer", email: "v@example.com", role: "user" as const },
  loading: false,
};

describe("CommentList", () => {
  beforeEach(() => {
    // A harmless default (logged out, not loading) for the tests below that
    // only care about the comments area, not the composer.
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseCreateComment.mockReturnValue(fakeMutation());
    mockUseUpdateComment.mockReturnValue(fakeUpdateMutation());
    mockUseDeleteComment.mockReturnValue(fakeDeleteMutation());
  });

  afterEach(() => {
    mockUseComments.mockReset();
    mockUseCreateComment.mockReset();
    mockUseUpdateComment.mockReset();
    mockUseDeleteComment.mockReset();
    mockUseAuth.mockReset();
  });

  it("shows a loading state while the comments query is in flight", () => {
    mockUseComments.mockReturnValue(pendingComments());
    renderCommentList({ commentCount: 0 });

    // Two role="status" elements now exist — the sr-only live region
    // (added for edit/delete announcements) and this loading indicator —
    // so this is scoped by its own text, not the bare role.
    expect(screen.getByText("Loading comments…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no comments", () => {
    mockUseComments.mockReturnValue(successComments([]));
    renderCommentList({ commentCount: 0 });

    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
  });

  it("renders the fetched tree and the passed-in count", () => {
    mockUseComments.mockReturnValue(successComments(TREE));
    renderCommentList({ commentCount: 1 });

    expect(screen.getByText("first comment")).toBeInTheDocument();
    expect(screen.getByText("Comments (1)")).toBeInTheDocument();
  });

  it("shows an error state with a retry button on failure", () => {
    mockUseComments.mockReturnValue(errorComments());
    renderCommentList({ commentCount: 0 });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  describe("composer gating", () => {
    beforeEach(() => {
      mockUseComments.mockReturnValue(successComments([]));
    });

    it("shows neither the composer nor a sign-in link while auth is loading", () => {
      mockUseAuth.mockReturnValue({ user: null, loading: true });
      renderCommentList({ commentCount: 0 });

      expect(
        screen.queryByPlaceholderText("Write a comment…"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    });

    it("shows a sign-in link when logged out", () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      renderCommentList({ commentCount: 0 });

      const link = screen.getByRole("link", { name: "Sign in" });
      expect(link).toHaveAttribute("href", "/login");
    });

    it("shows the composer for a 'user'-role viewer", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "u1", fullName: "A User", email: "a@example.com", role: "user" },
        loading: false,
      });
      renderCommentList({ commentCount: 0 });

      expect(screen.getByPlaceholderText("Write a comment…")).toBeInTheDocument();
    });

    it("shows neither the composer nor a sign-in link for an admin", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "a1", fullName: "An Admin", email: "admin@example.com", role: "admin" },
        loading: false,
      });
      renderCommentList({ commentCount: 0 });

      expect(
        screen.queryByPlaceholderText("Write a comment…"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    });
  });

  describe("open-form coordination", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(LOGGED_IN_USER);
      mockUseComments.mockReturnValue(successComments(TWO_COMMENT_TREE));
    });

    it("switches straight to a different comment's reply form when the open one is empty", async () => {
      const user = userEvent.setup();
      const confirmSpy = jest.spyOn(window, "confirm");
      renderCommentList({ commentCount: 2 });

      const [replyOnFirst, replyOnSecond] = screen.getAllByRole("button", {
        name: "Reply",
      });
      await user.click(replyOnFirst);
      expect(screen.getByPlaceholderText("Reply to Ada Lovelace…")).toBeInTheDocument();

      await user.click(replyOnSecond);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(
        screen.queryByPlaceholderText("Reply to Ada Lovelace…"),
      ).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Reply to Grace Hopper…")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("asks for confirmation before discarding unsent text when switching to a different comment", async () => {
      const user = userEvent.setup();
      const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
      renderCommentList({ commentCount: 2 });

      const [replyOnFirst, replyOnSecond] = screen.getAllByRole("button", {
        name: "Reply",
      });
      await user.click(replyOnFirst);
      await user.type(
        screen.getByPlaceholderText("Reply to Ada Lovelace…"),
        "an unsent draft",
      );

      await user.click(replyOnSecond);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByPlaceholderText("Reply to Grace Hopper…")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("keeps the original form open when the discard is declined", async () => {
      const user = userEvent.setup();
      const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
      renderCommentList({ commentCount: 2 });

      const [replyOnFirst, replyOnSecond] = screen.getAllByRole("button", {
        name: "Reply",
      });
      await user.click(replyOnFirst);
      await user.type(
        screen.getByPlaceholderText("Reply to Ada Lovelace…"),
        "an unsent draft",
      );

      await user.click(replyOnSecond);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByPlaceholderText("Reply to Ada Lovelace…")).toHaveValue(
        "an unsent draft",
      );
      expect(
        screen.queryByPlaceholderText("Reply to Grace Hopper…"),
      ).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("shows the Edit trigger for the author on their own comment, alongside Reply on both", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "author-1", fullName: "Ada Lovelace", email: "a@example.com", role: "user" },
        loading: false,
      });
      renderCommentList({ commentCount: 2 });

      // author-1 owns c1: sees Edit there, but not on c2 (author-2's).
      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Reply" })).toHaveLength(2);
    });
  });
});
