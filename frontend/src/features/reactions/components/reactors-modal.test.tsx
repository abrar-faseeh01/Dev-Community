import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Reactor } from "../types/reactor";
import { ReactorsModal } from "./reactors-modal";

const ADA: Reactor = {
  user: { id: "u-ada", fullName: "Ada Lovelace", headline: "Engineer" },
  type: "like",
};
const GRACE: Reactor = {
  user: { id: "u-grace", fullName: "Grace Hopper" },
  type: "dislike",
};
const DELETED: Reactor = {
  user: { id: null, fullName: "Deleted user", headline: null },
  type: "like",
};

type Props = Parameters<typeof ReactorsModal>[0];

function props(overrides: Partial<Props> = {}): Props {
  return {
    open: true,
    onClose: jest.fn(),
    tab: "all",
    onTabChange: jest.fn(),
    likeCount: 12,
    dislikeCount: 2,
    reactors: [ADA, GRACE],
    isPending: false,
    isError: false,
    onRetry: jest.fn(),
    viewerId: null,
    ...overrides,
  };
}

describe("ReactorsModal", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<ReactorsModal {...props({ open: false })} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe("tabs", () => {
    it("has All, Like and Dislike tabs with the target's totals", () => {
      render(<ReactorsModal {...props()} />);

      const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
      expect(tabs.map((t) => t.textContent)).toEqual([
        "All 14",
        "Like 12",
        "Dislike 2",
      ]);
    });

    it("marks the selected tab", () => {
      render(<ReactorsModal {...props({ tab: "like" })} />);

      expect(screen.getByRole("tab", { name: "Like 12" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tab", { name: "All 14" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("asks for the tab that was clicked", async () => {
      const user = userEvent.setup();
      const onTabChange = jest.fn();
      render(<ReactorsModal {...props({ onTabChange })} />);

      await user.click(screen.getByRole("tab", { name: "Dislike 2" }));

      expect(onTabChange).toHaveBeenCalledWith("dislike");
    });

    it("moves between tabs with the arrow keys, wrapping round", async () => {
      const user = userEvent.setup();
      const onTabChange = jest.fn();
      const { rerender } = render(<ReactorsModal {...props({ onTabChange })} />);

      screen.getByRole("tab", { name: "All 14" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(onTabChange).toHaveBeenLastCalledWith("like");

      await user.keyboard("{ArrowLeft}");
      // From All, Left wraps to the last tab.
      expect(onTabChange).toHaveBeenLastCalledWith("dislike");

      rerender(<ReactorsModal {...props({ onTabChange, tab: "dislike" })} />);
      screen.getByRole("tab", { name: "Dislike 2" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(onTabChange).toHaveBeenLastCalledWith("all");
    });
  });

  describe("the list", () => {
    it("shows each person's name, initials avatar and headline", () => {
      render(<ReactorsModal {...props()} />);

      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(within(items[0]).getByText("Ada Lovelace")).toBeInTheDocument();
      expect(within(items[0]).getByText("Engineer")).toBeInTheDocument();
      // The Avatar component's first + last initial.
      expect(within(items[0]).getByText("AL")).toBeInTheDocument();
      expect(within(items[1]).getByText("Grace Hopper")).toBeInTheDocument();
      expect(within(items[1]).getByText("GH")).toBeInTheDocument();
    });

    it("says which reaction each person gave on the All tab", () => {
      render(<ReactorsModal {...props()} />);

      const items = screen.getAllByRole("listitem");
      expect(within(items[0]).getByText("Liked")).toBeInTheDocument();
      expect(within(items[1]).getByText("Disliked")).toBeInTheDocument();
    });

    it("does not repeat the type on a single-type tab", () => {
      render(<ReactorsModal {...props({ tab: "like", reactors: [ADA] })} />);

      expect(screen.queryByText("Liked")).not.toBeInTheDocument();
    });

    it("shows a deleted account as 'Deleted user'", () => {
      render(<ReactorsModal {...props({ reactors: [DELETED, DELETED] })} />);

      expect(screen.getAllByText("Deleted user")).toHaveLength(2);
    });

    it("marks the viewer's own row", () => {
      render(<ReactorsModal {...props({ viewerId: "u-grace" })} />);

      const items = screen.getAllByRole("listitem");
      expect(within(items[1]).getByText("You")).toBeInTheDocument();
      expect(within(items[0]).queryByText("You")).not.toBeInTheDocument();
    });

    it("marks nobody when signed out", () => {
      render(<ReactorsModal {...props({ viewerId: null })} />);

      expect(screen.queryByText("You")).not.toBeInTheDocument();
    });

    it("does not mark a deleted account as the viewer when signed out", () => {
      // Both ids are null: they must not count as a match.
      render(<ReactorsModal {...props({ reactors: [DELETED], viewerId: null })} />);

      expect(screen.queryByText("You")).not.toBeInTheDocument();
    });

    it("never treats a deleted account as the viewer", () => {
      render(<ReactorsModal {...props({ reactors: [DELETED], viewerId: "u1" })} />);

      expect(screen.queryByText("You")).not.toBeInTheDocument();
    });
  });

  describe("cap note", () => {
    it("says how many are shown when the list is shorter than the total", () => {
      render(<ReactorsModal {...props({ likeCount: 60, dislikeCount: 2 })} />);

      expect(
        screen.getByText("Showing the 2 most recent of 62."),
      ).toBeInTheDocument();
    });

    it("says nothing when everyone is shown", () => {
      render(<ReactorsModal {...props({ likeCount: 1, dislikeCount: 1 })} />);

      expect(screen.queryByText(/most recent of/)).not.toBeInTheDocument();
    });
  });

  describe("states", () => {
    it("shows a loading state until the list arrives", () => {
      render(
        <ReactorsModal {...props({ isPending: true, reactors: undefined })} />,
      );

      expect(screen.getByRole("status")).toHaveTextContent("Loading reactions…");
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });

    it("shows an error with a Retry that retries", async () => {
      const user = userEvent.setup();
      const onRetry = jest.fn();
      render(
        <ReactorsModal
          {...props({ isError: true, reactors: undefined, onRetry })}
        />,
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn’t load who reacted.",
      );
      await user.click(screen.getByRole("button", { name: "Retry" }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["all", "No reactions yet."],
      ["like", "No likes yet."],
      ["dislike", "No dislikes yet."],
    ] as const)("shows an empty state on the %s tab", (tab, text) => {
      render(
        <ReactorsModal
          {...props({ tab, reactors: [], likeCount: 0, dislikeCount: 0 })}
        />,
      );

      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });
  });

  describe("closing and focus", () => {
    it("closes with the Close button", async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<ReactorsModal {...props({ onClose })} />);

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes with Escape", async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<ReactorsModal {...props({ onClose })} />);

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes on a click outside the dialog, but not inside it", async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<ReactorsModal {...props({ onClose })} />);

      await user.click(screen.getByRole("dialog"));
      expect(onClose).not.toHaveBeenCalled();

      await user.click(screen.getByRole("dialog").parentElement!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("moves focus to the selected tab when it opens", () => {
      render(<ReactorsModal {...props({ tab: "like" })} />);

      expect(screen.getByRole("tab", { name: "Like 12" })).toHaveFocus();
    });

    it("keeps Tab inside the dialog", async () => {
      const user = userEvent.setup();
      render(<ReactorsModal {...props()} />);

      // The first control is Close: Shift+Tab from it wraps to the last.
      screen.getByRole("button", { name: "Close" }).focus();
      await user.tab({ shift: true });

      expect(screen.getByRole("tab", { name: "Dislike 2" })).toHaveFocus();
    });

    it("also wraps forward: Tab from the last control goes to the first", async () => {
      const user = userEvent.setup();
      render(<ReactorsModal {...props()} />);

      screen.getByRole("tab", { name: "Dislike 2" }).focus();
      await user.tab();

      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });

    it("is a labelled modal dialog", () => {
      render(<ReactorsModal {...props()} />);

      const dialog = screen.getByRole("dialog", { name: "Reactions" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("gives focus back to what opened it when it closes", () => {
      const { rerender } = render(
        <>
          <button type="button">opener</button>
          <ReactorsModal {...props({ open: false })} />
        </>,
      );
      screen.getByRole("button", { name: "opener" }).focus();

      rerender(
        <>
          <button type="button">opener</button>
          <ReactorsModal {...props({ open: true })} />
        </>,
      );
      expect(screen.getByRole("tab", { name: "All 14" })).toHaveFocus();

      rerender(
        <>
          <button type="button">opener</button>
          <ReactorsModal {...props({ open: false })} />
        </>,
      );
      expect(screen.getByRole("button", { name: "opener" })).toHaveFocus();
    });
  });
});
