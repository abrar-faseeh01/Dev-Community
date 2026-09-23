import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";

// A small harness mirroring how real callers use ConfirmDialog: `open` is
// owned by the parent, and closing (Cancel/Confirm/Escape) flips it back to
// false, which is what ConfirmDialog's own focus-restore effect keys off.
function Harness({
  showReasonInput = false,
  onOpenerRef,
}: {
  showReasonInput?: boolean;
  onOpenerRef?: (node: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div>
      <button
        ref={(node) => {
          openerRef.current = node;
          onOpenerRef?.(node);
        }}
        onClick={() => setOpen(true)}
      >
        Open
      </button>
      <ConfirmDialog
        open={open}
        title="Delete this?"
        message="This can't be undone."
        showReasonInput={showReasonInput}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

describe("ConfirmDialog focus management", () => {
  it("focuses the Cancel button on open when there is no reason input", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("focuses the reason input on open when the dialog has one", async () => {
    const user = userEvent.setup();
    render(<Harness showReasonInput />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByLabelText("Reason (optional)")).toHaveFocus();
  });

  it("traps Tab within the dialog, wrapping from the last control to the first", async () => {
    const user = userEvent.setup();
    render(<Harness showReasonInput />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const reasonInput = screen.getByLabelText("Reason (optional)");
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });

    expect(reasonInput).toHaveFocus();
    await user.tab();
    expect(cancelButton).toHaveFocus();
    await user.tab();
    expect(deleteButton).toHaveFocus();

    // Past the last control, Tab wraps back to the first rather than
    // leaving the dialog.
    await user.tab();
    expect(reasonInput).toHaveFocus();

    // Shift+Tab off the first control wraps to the last.
    await user.tab({ shift: true });
    expect(deleteButton).toHaveFocus();
  });

  it("restores focus to the opener after Cancel closes the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const openButton = screen.getByRole("button", { name: "Open" });
    await user.click(openButton);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(openButton).toHaveFocus();
  });

  it("restores focus to the opener after Escape closes the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const openButton = screen.getByRole("button", { name: "Open" });
    await user.click(openButton);
    await user.keyboard("{Escape}");

    expect(openButton).toHaveFocus();
  });

  it("does not try to focus the opener once it has been removed from the document", async () => {
    const user = userEvent.setup();
    const openerBox: { node: HTMLButtonElement | null } = { node: null };
    render(<Harness onOpenerRef={(node) => (openerBox.node = node ?? openerBox.node)} />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    const opener = openerBox.node;
    expect(opener).not.toBeNull();
    if (!opener) throw new Error("opener button did not mount");

    const focusSpy = jest.spyOn(opener, "focus");
    opener.remove();
    expect(opener.isConnected).toBe(false);

    // Should not throw, and must not call .focus() on a detached element.
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("wires aria-labelledby/aria-describedby to the title and message", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("alertdialog");
    const titleId = dialog.getAttribute("aria-labelledby");
    const descriptionId = dialog.getAttribute("aria-describedby");

    expect(titleId).toBeTruthy();
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(titleId as string)).toHaveTextContent(
      "Delete this?",
    );
    expect(document.getElementById(descriptionId as string)).toHaveTextContent(
      "This can't be undone.",
    );
  });
});
