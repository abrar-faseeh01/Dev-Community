import { render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import { SortedPostFeed } from "./sorted-post-feed";

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
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

function setup(query: string) {
  mockUseSearchParams.mockReturnValue(
    new URLSearchParams(query) as ReturnType<typeof useSearchParams>,
  );
  render(<SortedPostFeed />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SortedPostFeed", () => {
  it("shows the latest feed for a bare /posts", () => {
    setup("");
    expect(screen.getByTestId("feed")).toHaveTextContent("latest");
  });

  it.each([
    ["sort=top", "top"],
    ["sort=discussed", "discussed"],
    ["sort=latest", "latest"],
  ])("follows %s", (query, sort) => {
    setup(query);
    expect(screen.getByTestId("feed")).toHaveTextContent(sort);
  });

  it.each(["sort=bogus", "sort=TOP", "sort="])(
    "falls back to latest for %s",
    (query) => {
      setup(query);
      expect(screen.getByTestId("feed")).toHaveTextContent("latest");
    },
  );
});
