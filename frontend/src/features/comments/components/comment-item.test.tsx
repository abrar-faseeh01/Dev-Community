import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Comment } from "@/features/comments/types/comment";
import {
  useDeleteComment,
  type useCreateComment,
  type useUpdateComment,
} from "@/features/comments/mutations/comment-mutations";
import { ApiError } from "@/lib/axios/api-error";
import { CommentItem, type ActiveForm, type FormCoordination } from "./comment-item";

// comment-item.tsx calls useDeleteComment (and useQueryClient) internally —
// unlike reply/update, which arrive as props — so it needs both a mocked
// hook and a real QueryClientProvider in the tree (useQueryClient() throws
// without one, even with useDeleteComment itself mocked).
jest.mock("@/features/comments/mutations/comment-mutations");
const mockUseDeleteComment = useDeleteComment as jest.MockedFunction<
  typeof useDeleteComment
>;

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    postId: "post-1",
    parentCommentId: null,
    body: "hello world",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: { id: "author-1", fullName: "Ada Lovelace", headline: null },
    replies: [],
    ...overrides,
  };
}

const USER = { id: "viewer-1", role: "user" as const };
const ADMIN = { id: "admin-1", role: "admin" as const };
const POST_AUTHOR_ID = "post-owner-1";

function makeCoordination(overrides: Partial<FormCoordination> = {}): FormCoordination {
  return {
    activeForm: null,
    justCreatedId: null,
    clearJustCreated: jest.fn(),
    justSavedId: null,
    clearJustSaved: jest.fn(),
    requestForm: jest.fn(),
    closeForm: jest.fn(),
    onFormDirtyChange: jest.fn(),
    onCommentDeleted: jest.fn(),
    ...overrides,
  };
}

function fakeReplyMutation(
  overrides: Partial<ReturnType<typeof useCreateComment>> = {},
) {
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useCreateComment>;
}

function fakeUpdateMutation(
  overrides: Partial<ReturnType<typeof useUpdateComment>> = {},
) {
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useUpdateComment>;
}

function fakeDeleteMutation(
  overrides: Partial<ReturnType<typeof useDeleteComment>> = {},
) {
  return {
    isPending: false,
    isError: false,
    error: null,
    reset: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue({ id: "c1", deletedAt: "x", deletedCount: 1 }),
    ...overrides,
  } as unknown as ReturnType<typeof useDeleteComment>;
}

// Common props every render below needs, with sensible defaults — each test
// overrides only what it's actually exercising.
function baseProps(overrides: Partial<Parameters<typeof CommentItem>[0]> = {}) {
  return {
    comment: makeComment(),
    viewer: USER,
    postAuthorId: POST_AUTHOR_ID,
    coordination: makeCoordination(),
    replyMutation: fakeReplyMutation(),
    updateMutation: fakeUpdateMutation(),
    ...overrides,
  };
}

function renderCommentItem(props: ReturnType<typeof baseProps>) {
  const client = new QueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <CommentItem {...props} />
    </QueryClientProvider>,
  );
  return {
    ...utils,
    rerenderItem: (nextProps: ReturnType<typeof baseProps>) =>
      utils.rerender(
        <QueryClientProvider client={client}>
          <CommentItem {...nextProps} />
        </QueryClientProvider>,
      ),
  };
}

beforeEach(() => {
  mockUseDeleteComment.mockReturnValue(fakeDeleteMutation());
});

afterEach(() => {
  mockUseDeleteComment.mockReset();
});

describe("CommentItem", () => {
  it("renders the author and body", () => {
    renderCommentItem(baseProps({ comment: makeComment({ body: "a real comment" }) }));

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("a real comment")).toBeInTheDocument();
  });

  it("shows an (edited) label when updatedAt differs from createdAt", () => {
    renderCommentItem(
      baseProps({
        comment: makeComment({
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      }),
    );

    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });

  it("does not show an (edited) label when updatedAt equals createdAt", () => {
    renderCommentItem(
      baseProps({
        comment: makeComment({
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    );

    expect(screen.queryByText("(edited)")).not.toBeInTheDocument();
  });

  it("shows 'Replying to @X' for a direct reply, naming its root", () => {
    const root = makeComment({
      id: "root-1",
      body: "root body",
      author: { id: "author-1", fullName: "Ada Lovelace", headline: null },
      replies: [
        makeComment({
          id: "reply-1",
          parentCommentId: "root-1",
          body: "direct reply",
          author: { id: "author-2", fullName: "Grace Hopper", headline: null },
        }),
      ],
    });

    renderCommentItem(baseProps({ comment: root }));

    expect(screen.getByText("direct reply")).toBeInTheDocument();
    expect(screen.getByText("@Ada Lovelace")).toBeInTheDocument();
  });

  it("shows 'Replying to @X' for a reply flattened past its real parent, using the real parent's author", () => {
    const root = makeComment({
      id: "root-1",
      replies: [
        makeComment({
          id: "reply-1",
          parentCommentId: "root-1",
          body: "direct reply",
          author: { id: "author-2", fullName: "Grace Hopper", headline: null },
        }),
        makeComment({
          id: "reply-2",
          parentCommentId: "reply-1",
          body: "flattened deeper reply",
          author: { id: "author-3", fullName: "Alan Turing", headline: null },
        }),
      ],
    });

    renderCommentItem(baseProps({ comment: root }));

    expect(screen.getByText("flattened deeper reply")).toBeInTheDocument();
    expect(screen.getByText("@Grace Hopper")).toBeInTheDocument();
  });

  describe("long comment expand/collapse", () => {
    it("shows no 'Show more' control for a short comment", () => {
      renderCommentItem(baseProps({ comment: makeComment({ body: "short" }) }));

      expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    });

    it("clamps a long comment behind 'Show more', and expands it on click", async () => {
      const user = userEvent.setup();
      const longBody = "a".repeat(501);
      renderCommentItem(baseProps({ comment: makeComment({ body: longBody }) }));

      const paragraph = screen.getByText(longBody);
      expect(paragraph.className).toContain("line-clamp-6");
      expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Show more" }));

      expect(paragraph.className).not.toContain("line-clamp-6");
      expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
    });
  });

  describe("Reply", () => {
    it("shows the Reply trigger for a 'user' viewer", () => {
      renderCommentItem(baseProps());
      expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    });

    it("hides the Reply trigger for an admin and for a logged-out viewer", () => {
      const { rerenderItem } = renderCommentItem(baseProps({ viewer: ADMIN }));
      expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();

      rerenderItem(baseProps({ viewer: null }));
      expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
    });

    it("calls requestForm(comment.id, 'reply') when Reply is clicked", async () => {
      const user = userEvent.setup();
      const requestForm = jest.fn();
      renderCommentItem(
        baseProps({
          comment: makeComment({ id: "c42" }),
          coordination: makeCoordination({ requestForm }),
        }),
      );

      await user.click(screen.getByRole("button", { name: "Reply" }));
      expect(requestForm).toHaveBeenCalledWith("c42", "reply");
    });

    it("renders the reply form instead of the trigger when activeForm points at this comment", () => {
      const activeForm: ActiveForm = { commentId: "c1", kind: "reply" };
      renderCommentItem(
        baseProps({
          comment: makeComment({ id: "c1" }),
          coordination: makeCoordination({ activeForm }),
        }),
      );

      expect(screen.getByPlaceholderText("Reply to Ada Lovelace…")).toBeInTheDocument();
      // The form's own submit button is also named "Reply" (submitLabel) —
      // asserting there's exactly one confirms the standalone trigger isn't
      // also rendered redundantly alongside it.
      expect(screen.getAllByRole("button", { name: "Reply" })).toHaveLength(1);
    });

    it("submits with parentCommentId set to this comment's id", async () => {
      const user = userEvent.setup();
      const mutateAsync = jest.fn().mockResolvedValue(undefined);
      const activeForm: ActiveForm = { commentId: "c1", kind: "reply" };
      renderCommentItem(
        baseProps({
          comment: makeComment({ id: "c1" }),
          coordination: makeCoordination({ activeForm }),
          replyMutation: fakeReplyMutation({ mutateAsync }),
        }),
      );

      await user.type(screen.getByPlaceholderText("Reply to Ada Lovelace…"), "a reply");
      await user.click(screen.getByRole("button", { name: "Reply" }));

      expect(mutateAsync).toHaveBeenCalledWith({
        body: "a reply",
        parentCommentId: "c1",
      });
    });

    it("returns focus to the Reply trigger once the form closes", () => {
      const { rerenderItem } = renderCommentItem(
        baseProps({
          comment: makeComment({ id: "c1" }),
          coordination: makeCoordination({ activeForm: { commentId: "c1", kind: "reply" } }),
        }),
      );
      expect(screen.getByPlaceholderText("Reply to Ada Lovelace…")).toBeInTheDocument();

      rerenderItem(
        baseProps({
          comment: makeComment({ id: "c1" }),
          coordination: makeCoordination({ activeForm: null }),
        }),
      );

      expect(screen.getByRole("button", { name: "Reply" })).toHaveFocus();
    });
  });

  describe("Edit", () => {
    it("shows the Edit trigger only for the comment's own author", () => {
      const own = makeComment({ id: "c1", author: { id: USER.id, fullName: "Me", headline: null } });
      const { rerenderItem } = renderCommentItem(baseProps({ comment: own }));
      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

      const someoneElses = makeComment({ id: "c1" }); // author-1, not USER
      rerenderItem(baseProps({ comment: someoneElses }));
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    });

    it("shows the Edit trigger for the post's author, but not for an unrelated admin", () => {
      const comment = makeComment({ id: "c1" }); // author-1
      const postOwnerViewer = { id: POST_AUTHOR_ID, role: "user" as const };
      const { rerenderItem } = renderCommentItem(
        baseProps({ comment, viewer: postOwnerViewer }),
      );
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

      rerenderItem(baseProps({ comment, viewer: ADMIN }));
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    });

    it("shows the Edit trigger for the author even if their current role is admin", () => {
      const comment = makeComment({ id: "c1", author: { id: "promoted-1", fullName: "Promoted", headline: null } });
      const promotedViewer = { id: "promoted-1", role: "admin" as const };
      renderCommentItem(baseProps({ comment, viewer: promotedViewer }));

      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    });

    it("clicking Edit calls requestForm(comment.id, 'edit')", async () => {
      const user = userEvent.setup();
      const requestForm = jest.fn();
      const own = makeComment({ id: "c1", author: { id: USER.id, fullName: "Me", headline: null } });
      renderCommentItem(
        baseProps({ comment: own, coordination: makeCoordination({ requestForm }) }),
      );

      await user.click(screen.getByRole("button", { name: "Edit" }));
      expect(requestForm).toHaveBeenCalledWith("c1", "edit");
    });

    it("replaces the body with a pre-filled form, hiding Reply/Edit/Delete, while editing", () => {
      const own = makeComment({
        id: "c1",
        body: "original body",
        author: { id: USER.id, fullName: "Me", headline: null },
      });
      renderCommentItem(
        baseProps({
          comment: own,
          coordination: makeCoordination({ activeForm: { commentId: "c1", kind: "edit" } }),
        }),
      );

      expect(screen.queryByText("original body")).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Edit your comment…")).toHaveValue("original body");
      expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });

    it("submits the edited body with this comment's id", async () => {
      const user = userEvent.setup();
      const mutateAsync = jest.fn().mockResolvedValue(undefined);
      const own = makeComment({
        id: "c1",
        body: "original",
        author: { id: USER.id, fullName: "Me", headline: null },
      });
      renderCommentItem(
        baseProps({
          comment: own,
          coordination: makeCoordination({ activeForm: { commentId: "c1", kind: "edit" } }),
          updateMutation: fakeUpdateMutation({ mutateAsync }),
        }),
      );

      const textarea = screen.getByPlaceholderText("Edit your comment…");
      await user.clear(textarea);
      await user.type(textarea, "edited body");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(mutateAsync).toHaveBeenCalledWith({ id: "c1", body: "edited body" });
    });

    it("focuses the Edit button once justSavedId matches this comment, and clears the flag", () => {
      const clearJustSaved = jest.fn();
      const own = makeComment({ id: "c1", author: { id: USER.id, fullName: "Me", headline: null } });
      renderCommentItem(
        baseProps({
          comment: own,
          coordination: makeCoordination({ justSavedId: "c1", clearJustSaved }),
        }),
      );

      expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
      expect(clearJustSaved).toHaveBeenCalledTimes(1);
    });

    it("does nothing when justSavedId refers to a different comment", () => {
      const clearJustSaved = jest.fn();
      const own = makeComment({ id: "c1", author: { id: USER.id, fullName: "Me", headline: null } });
      renderCommentItem(
        baseProps({
          comment: own,
          coordination: makeCoordination({ justSavedId: "some-other-id", clearJustSaved }),
        }),
      );

      expect(screen.getByRole("button", { name: "Edit" })).not.toHaveFocus();
      expect(clearJustSaved).not.toHaveBeenCalled();
    });
  });

  describe("Delete", () => {
    it("shows the Delete trigger for the author, the post's owner, and an admin", () => {
      const comment = makeComment({ id: "c1" }); // author-1
      const postOwnerViewer = { id: POST_AUTHOR_ID, role: "user" as const };
      const { rerenderItem } = renderCommentItem(baseProps({ comment, viewer: postOwnerViewer }));
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

      rerenderItem(baseProps({ comment, viewer: ADMIN }));
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

      const own = makeComment({ id: "c1", author: { id: USER.id, fullName: "Me", headline: null } });
      rerenderItem(baseProps({ comment: own, viewer: USER }));
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    it("hides the Delete trigger for an unrelated logged-in user", () => {
      const unrelated = { id: "unrelated-1", role: "user" as const };
      renderCommentItem(baseProps({ viewer: unrelated }));

      expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });

    it("shows a reason input only for an admin, not for the author or the post's owner", async () => {
      const user = userEvent.setup();
      const own = makeComment({ id: "c1", author: { id: USER.id, fullName: "Me", headline: null } });
      renderCommentItem(baseProps({ comment: own, viewer: USER }));

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.queryByLabelText("Reason (optional)")).not.toBeInTheDocument();
    });

    it("shows a reason input and an admin-labelled dialog for an admin deleting someone else's comment", async () => {
      const user = userEvent.setup();
      renderCommentItem(baseProps({ viewer: ADMIN })); // comment authored by author-1

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(
        screen.getByRole("heading", { name: "Delete Ada Lovelace's comment as admin?" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Reason (optional)")).toBeInTheDocument();
    });

    it("uses the post-owner wording, with no reason input, when the post's author deletes someone else's comment", async () => {
      const user = userEvent.setup();
      const postOwnerViewer = { id: POST_AUTHOR_ID, role: "user" as const };
      renderCommentItem(baseProps({ viewer: postOwnerViewer }));

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(
        screen.getByRole("heading", { name: "Delete Ada Lovelace's comment from your post?" }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Reason (optional)")).not.toBeInTheDocument();
    });

    it("on confirm, calls mutateAsync with the comment id and reports the parent id as the focus target for a reply", async () => {
      const user = userEvent.setup();
      const mutateAsync = jest
        .fn()
        .mockResolvedValue({ id: "reply-1", deletedAt: "x", deletedCount: 1 });
      const onCommentDeleted = jest.fn();
      mockUseDeleteComment.mockReturnValue(fakeDeleteMutation({ mutateAsync }));

      const reply = makeComment({
        id: "reply-1",
        parentCommentId: "root-1",
        author: { id: USER.id, fullName: "Me", headline: null },
      });
      renderCommentItem(
        baseProps({ comment: reply, coordination: makeCoordination({ onCommentDeleted }) }),
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      const dialog = screen.getByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));

      expect(mutateAsync).toHaveBeenCalledWith({ id: "reply-1", reason: undefined });
      expect(onCommentDeleted).toHaveBeenCalledWith("root-1", 1);
    });

    it("reports 'heading' as the focus target for a root comment, and passes the cascade's deletedCount through", async () => {
      const user = userEvent.setup();
      const mutateAsync = jest
        .fn()
        .mockResolvedValue({ id: "c1", deletedAt: "x", deletedCount: 3 });
      const onCommentDeleted = jest.fn();
      mockUseDeleteComment.mockReturnValue(fakeDeleteMutation({ mutateAsync }));

      const own = makeComment({
        id: "c1",
        parentCommentId: null,
        author: { id: USER.id, fullName: "Me", headline: null },
      });
      renderCommentItem(
        baseProps({ comment: own, coordination: makeCoordination({ onCommentDeleted }) }),
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(
        within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }),
      );

      expect(onCommentDeleted).toHaveBeenCalledWith("heading", 3);
    });

    it("on a 404 (already deleted by someone else), closes the dialog without calling onCommentDeleted", async () => {
      const user = userEvent.setup();
      const mutateAsync = jest.fn().mockRejectedValue(new ApiError("Comment not found", [], 404));
      const onCommentDeleted = jest.fn();
      mockUseDeleteComment.mockReturnValue(fakeDeleteMutation({ mutateAsync }));

      const own = makeComment({
        id: "c1",
        author: { id: USER.id, fullName: "Me", headline: null },
      });
      renderCommentItem(
        baseProps({ comment: own, coordination: makeCoordination({ onCommentDeleted }) }),
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(
        within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }),
      );

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(onCommentDeleted).not.toHaveBeenCalled();
    });
  });
});
