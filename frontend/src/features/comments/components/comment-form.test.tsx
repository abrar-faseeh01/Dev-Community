import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { CommentForm } from "./comment-form";

const baseProps = {
  placeholder: "Write a comment…",
  submitLabel: "Comment",
  pendingLabel: "Posting…",
  isPending: false,
};

describe("CommentForm", () => {
  it("calls onSubmit with the trimmed body and resets the field on success", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<CommentForm {...baseProps} onSubmit={onSubmit} />);

    const textarea = screen.getByPlaceholderText("Write a comment…");
    await user.type(textarea, "  a real comment  ");
    await user.click(screen.getByRole("button", { name: "Comment" }));

    expect(onSubmit).toHaveBeenCalledWith("a real comment");
    expect(textarea).toHaveValue("");
  });

  it("rejects a blank body client-side and never calls onSubmit", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<CommentForm {...baseProps} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Comment" }));

    expect(await screen.findByText("Comment can't be empty")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("preserves the typed text and shows the server error when the save fails", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockRejectedValue(new Error("boom"));

    // A small harness: the real callers (comment-list.tsx etc.) re-render
    // with the mutation's `error` once the failed request settles.
    function Harness() {
      const [error, setError] = useState<unknown>(undefined);
      return (
        <CommentForm
          {...baseProps}
          error={error}
          onSubmit={async (body) => {
            try {
              await onSubmit(body);
            } catch (e) {
              setError(e);
              throw e;
            }
          }}
        />
      );
    }
    render(<Harness />);

    const textarea = screen.getByPlaceholderText("Write a comment…");
    await user.type(textarea, "will fail");
    await user.click(screen.getByRole("button", { name: "Comment" }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(textarea).toHaveValue("will fail");
  });

  it("only renders Cancel when onCancel is provided, and calls it on click", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();

    const { rerender } = render(
      <CommentForm {...baseProps} onSubmit={jest.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    rerender(<CommentForm {...baseProps} onSubmit={jest.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("focuses the textarea when autoFocus is true, not when it's false", () => {
    const { rerender } = render(
      <CommentForm {...baseProps} onSubmit={jest.fn()} autoFocus={false} />,
    );
    expect(screen.getByPlaceholderText("Write a comment…")).not.toHaveFocus();

    rerender(<CommentForm {...baseProps} onSubmit={jest.fn()} autoFocus />);
    expect(screen.getByPlaceholderText("Write a comment…")).toHaveFocus();
  });

  it("disables the submit button while isPending", () => {
    render(<CommentForm {...baseProps} onSubmit={jest.fn()} isPending />);

    expect(screen.getByRole("button", { name: "Posting…" })).toBeDisabled();
  });

  it("calls onCancel when Escape is pressed inside the form", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<CommentForm {...baseProps} onSubmit={jest.fn()} onCancel={onCancel} />);

    await user.click(screen.getByPlaceholderText("Write a comment…"));
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel for an Escape pressed outside the form (no document-level listener)", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(
      <div>
        <button type="button">outside</button>
        <CommentForm {...baseProps} onSubmit={jest.fn()} onCancel={onCancel} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "outside" }));
    await user.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("reports dirty state changes via onDirtyChange", async () => {
    const user = userEvent.setup();
    const onDirtyChange = jest.fn();
    render(
      <CommentForm {...baseProps} onSubmit={jest.fn()} onDirtyChange={onDirtyChange} />,
    );

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.type(screen.getByPlaceholderText("Write a comment…"), "a");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
