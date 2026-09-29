import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useSearchParams } from "next/navigation";
import { SortedPostFeed } from "./sorted-post-feed";

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
  usePathname: jest.fn(),
}));
// The list itself is tested elsewhere; here it only reports which sort it was
// given.
jest.mock("@/features/posts/components/post-feed", () => ({
  PostFeed: ({ sort }: { sort: string }) => (
    <div data-testid="feed">{sort}</div>
  ),
}));

const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

// window.history.pushState, not router.push: router.push runs through the
// App Router's transition machinery, which (see sorted-post-feed.tsx) is
// what caused a visited tab's posts to keep showing through an unvisited
// tab's fetch instead of the skeleton. pushState is a plain, untransitioned
// state update, so it's spied on directly rather than through a router mock.
const push = jest.spyOn(window.history, "pushState");

function setup(query: string) {
  mockUseSearchParams.mockReturnValue(
    new URLSearchParams(query) as ReturnType<typeof useSearchParams>,
  );
  render(<SortedPostFeed />);
  return { user: userEvent.setup() };
}

const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true");

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue("/posts");
});

describe("SortedPostFeed", () => {
  it("shows the latest feed for a bare /posts", () => {
    setup("");
    expect(selectedTab()).toHaveTextContent("Latest");
    expect(screen.getByTestId("feed")).toHaveTextContent("latest");
  });

  it.each([
    ["sort=top", "Top", "top"],
    ["sort=discussed", "Most Discussed", "discussed"],
    ["sort=latest", "Latest", "latest"],
  ])("opens %s on the matching tab and feed", (query, label, sort) => {
    setup(query);
    expect(selectedTab()).toHaveTextContent(label);
    expect(screen.getByTestId("feed")).toHaveTextContent(sort);
  });

  it.each(["sort=bogus", "sort=TOP", "sort="])(
    "falls back to latest for %s without touching the URL",
    (query) => {
      setup(query);
      expect(selectedTab()).toHaveTextContent("Latest");
      expect(screen.getByTestId("feed")).toHaveTextContent("latest");
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("pushes the sort into the URL via pushState, not router.push", async () => {
    const { user } = setup("");
    await user.click(screen.getByRole("tab", { name: "Top" }));
    expect(push).toHaveBeenCalledWith(null, "", "/posts?sort=top");
  });

  it("goes back to the bare URL for Latest", async () => {
    const { user } = setup("sort=top");
    await user.click(screen.getByRole("tab", { name: "Latest" }));
    expect(push).toHaveBeenCalledWith(null, "", "/posts");
  });

  it("keeps other params when changing sort", async () => {
    const { user } = setup("sort=top&notice=post-deleted");
    await user.click(screen.getByRole("tab", { name: "Most Discussed" }));
    expect(push).toHaveBeenCalledWith(
      null,
      "",
      "/posts?sort=discussed&notice=post-deleted",
    );
  });

  it("does not navigate when the selected tab is chosen again", async () => {
    const { user } = setup("sort=top");
    await user.click(screen.getByRole("tab", { name: "Top" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("cleans up an invalid value when Latest is chosen", async () => {
    const { user } = setup("sort=bogus");
    await user.click(screen.getByRole("tab", { name: "Latest" }));
    expect(push).toHaveBeenCalledWith(null, "", "/posts");
  });

  it("labels the panel with the selected tab", () => {
    setup("sort=discussed");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName("Most Discussed");
    expect(panel).toContainElement(screen.getByTestId("feed"));
  });
});
