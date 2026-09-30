import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useSearchParams } from "next/navigation";
import { FeedSortMenu } from "./feed-sort-menu";

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
  usePathname: jest.fn(),
}));

const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

// window.history.pushState, not router.push — same reasoning the old
// FeedTabs test had: a transition through an already-revealed <Suspense>
// boundary would hold the previous sort's posts on screen instead of
// committing the new one immediately.
const push = jest.spyOn(window.history, "pushState");

function setup(query: string) {
  mockUseSearchParams.mockReturnValue(
    new URLSearchParams(query) as ReturnType<typeof useSearchParams>,
  );
  render(<FeedSortMenu />);
  return { user: userEvent.setup() };
}

function trigger() {
  return screen.getByRole("button", { name: /Sort:/ });
}

function options() {
  return screen.getAllByRole("menuitemradio");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue("/posts");
});

describe("FeedSortMenu", () => {
  it("shows the current sort on the trigger, defaulting to Latest", () => {
    setup("");
    expect(trigger()).toHaveTextContent("Sort: Latest");
  });

  it.each([
    ["sort=top", "Top"],
    ["sort=discussed", "Most Discussed"],
    ["sort=latest", "Latest"],
    ["sort=bogus", "Latest"],
  ])("labels the trigger for %s", (query, label) => {
    setup(query);
    expect(trigger()).toHaveTextContent(`Sort: ${label}`);
  });

  it("is closed until the trigger is clicked", async () => {
    const { user } = setup("");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(options().map((o) => o.textContent)).toEqual([
      "Top",
      "Latest",
      "Most Discussed",
    ]);
  });

  it("marks only the current sort checked", async () => {
    const { user } = setup("sort=top");
    await user.click(trigger());
    expect(options().map((o) => o.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
  });

  it("pushes the chosen sort into the URL and closes the menu", async () => {
    const { user } = setup("");
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: "Top" }));
    expect(push).toHaveBeenCalledWith(null, "", "/posts?sort=top");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("goes back to the bare URL for Latest", async () => {
    const { user } = setup("sort=top");
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: "Latest" }));
    expect(push).toHaveBeenCalledWith(null, "", "/posts");
  });

  it("keeps other params when changing sort", async () => {
    const { user } = setup("sort=top&notice=post-deleted");
    await user.click(trigger());
    await user.click(
      screen.getByRole("menuitemradio", { name: "Most Discussed" }),
    );
    expect(push).toHaveBeenCalledWith(
      null,
      "",
      "/posts?sort=discussed&notice=post-deleted",
    );
  });

  it("does not navigate when the current sort is chosen again", async () => {
    const { user } = setup("sort=top");
    await user.click(trigger());
    await user.click(screen.getByRole("menuitemradio", { name: "Top" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("renders nothing while a search is active", () => {
    setup("q=react");
    expect(screen.queryByRole("button", { name: /Sort:/ })).not.toBeInTheDocument();
  });
});
