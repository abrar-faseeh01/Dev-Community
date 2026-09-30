import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types/user";
import type { Post, PostSearchPage } from "@/features/posts/types/post";
import { render, screen } from "@testing-library/react";
import { PostSearchResults } from "./post-search-results";

let mockParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockParams,
}));

jest.mock("@/features/auth/hooks/use-auth");
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};

jest.mock("./sorted-post-feed", () => ({
  SortedPostFeed: () => <div>FEED</div>,
}));

jest.mock("./post-card", () => ({
  PostCard: ({ post }: { post: Post }) => <article>{post.title}</article>,
}));

type SearchState = {
  isPending: boolean;
  isFetching: boolean;
  data: PostSearchPage | undefined;
  error: unknown;
  refetch: jest.Mock;
};

const mockUseSearchPosts = jest.fn<SearchState, [string]>();
jest.mock("@/features/posts/queries/post-queries", () => ({
  useSearchPosts: (term: string) => mockUseSearchPosts(term),
}));

const refetch = jest.fn();

function state(overrides: Partial<SearchState> = {}): SearchState {
  return {
    isPending: false,
    isFetching: false,
    data: { items: [], hasMore: false },
    error: null,
    refetch,
    ...overrides,
  };
}

function post(id: string, title: string): Post {
  return { id, title } as Post;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = new URLSearchParams("");
  mockUseAuth.mockReturnValue({ user: USER, loading: false });
  mockUseSearchPosts.mockReturnValue(state());
});

describe("PostSearchResults and sign-in", () => {
  it("shows the sorted feed and never queries for a signed-out visitor, even with ?q=", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockParams = new URLSearchParams("q=react");
    render(<PostSearchResults />);
    expect(screen.getByText("FEED")).toBeInTheDocument();
    expect(mockUseSearchPosts).toHaveBeenCalledWith("");
  });

  it("shows the sorted feed while the session is loading, even with ?q=", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockParams = new URLSearchParams("q=react");
    render(<PostSearchResults />);
    expect(screen.getByText("FEED")).toBeInTheDocument();
  });
});

describe("PostSearchResults states", () => {
  it("shows the sorted feed when there is no q", () => {
    render(<PostSearchResults />);
    expect(screen.getByText("FEED")).toBeInTheDocument();
    expect(mockUseSearchPosts).toHaveBeenCalledWith("");
  });

  it("searches the normalized term from the URL", () => {
    mockParams = new URLSearchParams("q=React  Hooks");
    render(<PostSearchResults />);
    expect(mockUseSearchPosts).toHaveBeenCalledWith("react hooks");
  });

  it("shows Searching… while pending", () => {
    mockParams = new URLSearchParams("q=react");
    mockUseSearchPosts.mockReturnValue(state({ isPending: true, data: undefined }));
    render(<PostSearchResults />);
    expect(screen.getByText("Searching posts…")).toBeInTheDocument();
  });

  it("shows the results, with no reaction controls", () => {
    mockParams = new URLSearchParams("q=hooks");
    mockUseSearchPosts.mockReturnValue(
      state({
        data: {
          items: [post("1", "React hooks"), post("2", "Hooks in depth")],
          hasMore: false,
        },
      }),
    );
    render(<PostSearchResults />);
    expect(screen.getByText("React hooks")).toBeInTheDocument();
    expect(screen.getByText("Hooks in depth")).toBeInTheDocument();
    expect(screen.queryByText(/Showing the top/)).not.toBeInTheDocument();
  });

  it("says when the cap cut the results off", () => {
    mockParams = new URLSearchParams("q=a");
    mockUseSearchPosts.mockReturnValue(
      state({ data: { items: [post("1", "A")], hasMore: true } }),
    );
    render(<PostSearchResults />);
    expect(screen.getByText(/Showing the top 1 matches/)).toBeInTheDocument();
  });

  it("shows the no-results state naming the normalized term", () => {
    mockParams = new URLSearchParams("q=Nothing   Here");
    render(<PostSearchResults />);
    expect(screen.getByText(/No posts match/)).toHaveTextContent(
      "No posts match “nothing here”",
    );
  });

  it("shows an error with Retry when the search failed and there is no data", () => {
    mockParams = new URLSearchParams("q=react");
    mockUseSearchPosts.mockReturnValue(
      state({ data: undefined, error: new Error("Boom") }),
    );
    render(<PostSearchResults />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps showing results when only a background refetch failed", () => {
    mockParams = new URLSearchParams("q=react");
    mockUseSearchPosts.mockReturnValue(
      state({
        data: { items: [post("1", "Still here")], hasMore: false },
        error: new Error("Boom"),
      }),
    );
    render(<PostSearchResults />);
    expect(screen.getByText("Still here")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
