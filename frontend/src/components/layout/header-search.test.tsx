import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types/user";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HeaderSearch } from "./header-search";

let mockPathname = "/posts";
let mockParams = new URLSearchParams("");
const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => mockPathname,
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

let replaceState: jest.SpyInstance;

function replaceWrites() {
  return replaceState.mock.calls.map((call) => String(call[2]));
}

function input() {
  return screen.queryByRole("searchbox") as HTMLInputElement | null;
}

function type(value: string) {
  fireEvent.change(input() as HTMLInputElement, { target: { value } });
}

function settle() {
  act(() => {
    jest.advanceTimersByTime(300);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPathname = "/posts";
  mockParams = new URLSearchParams("");
  mockUseAuth.mockReturnValue({ user: USER, loading: false });
  replaceState = jest
    .spyOn(window.history, "replaceState")
    .mockImplementation(() => {});
});

afterEach(() => {
  replaceState.mockRestore();
  jest.useRealTimers();
});

describe("HeaderSearch and sign-in", () => {
  it("renders nothing for a signed-out visitor", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<HeaderSearch />);
    expect(input()).not.toBeInTheDocument();
  });

  it("renders nothing while the session is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(<HeaderSearch />);
    expect(input()).not.toBeInTheDocument();
  });
});

describe("HeaderSearch on /posts", () => {
  it("starts from the term in the URL", () => {
    mockParams = new URLSearchParams("q=foo");
    render(<HeaderSearch />);
    expect(input()?.value).toBe("foo");
  });

  it("writes the settled term with replaceState, keeping other params", () => {
    mockParams = new URLSearchParams("sort=top");
    render(<HeaderSearch />);
    type("React");
    expect(replaceWrites()).toEqual([]);
    settle();
    expect(replaceWrites()).toEqual(["/posts?sort=top&q=react"]);
    expect(push).not.toHaveBeenCalled();
  });

  it("removes q once the input is emptied and settles", () => {
    mockParams = new URLSearchParams("q=react");
    render(<HeaderSearch />);
    type("");
    settle();
    expect(replaceWrites()).toEqual(["/posts"]);
  });

  // Regression (carried over from the old post-search.tsx): Back after a
  // sort change lands on a URL with no q while this component stays mounted.
  it("follows an external URL change back to no q, and does not write the old term back", () => {
    mockParams = new URLSearchParams("sort=top");
    const { rerender } = render(<HeaderSearch />);
    type("React");
    settle();
    mockParams = new URLSearchParams("sort=top&q=react");
    rerender(<HeaderSearch />);
    expect(replaceWrites()).toEqual(["/posts?sort=top&q=react"]);

    mockParams = new URLSearchParams("");
    rerender(<HeaderSearch />);
    expect(input()?.value).toBe("");

    settle();
    expect(replaceWrites()).toEqual(["/posts?sort=top&q=react"]);
  });

  it("does not snap the reader's casing or spacing when its own write comes back", () => {
    const { rerender } = render(<HeaderSearch />);
    type("React  Hooks");
    settle();
    mockParams = new URLSearchParams("q=react hooks");
    rerender(<HeaderSearch />);
    expect(input()?.value).toBe("React  Hooks");
  });
});

describe("HeaderSearch away from /posts", () => {
  beforeEach(() => {
    mockPathname = "/profile/u1";
  });

  it("starts empty regardless of any unrelated params on the current page", () => {
    mockParams = new URLSearchParams("tab=activity");
    render(<HeaderSearch />);
    expect(input()?.value).toBe("");
  });

  it("navigates to /posts with the settled term, via the router, not replaceState", () => {
    render(<HeaderSearch />);
    type("react");
    expect(push).not.toHaveBeenCalled();
    settle();
    expect(push).toHaveBeenCalledWith("/posts?q=react");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("does not navigate for a blank search", () => {
    render(<HeaderSearch />);
    type("   ");
    settle();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not navigate for a signed-out visitor even if a term were typed", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<HeaderSearch />);
    expect(input()).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // Regression: searching on /posts, then clicking a result (or any other
  // link) bounced straight back to /posts?q=... instead of letting the
  // navigation happen, because leaving /posts made urlSearchTerm "" again,
  // which looked identical to "a fresh term was just typed elsewhere."
  it("does not re-push the same term after navigating away from /posts with it still settled", () => {
    mockPathname = "/posts";
    mockParams = new URLSearchParams("");
    const { rerender } = render(<HeaderSearch />);
    type("react");
    settle();
    expect(replaceWrites()).toEqual(["/posts?q=react"]);
    push.mockClear();

    // Next.js reflects the replaceState write back into searchParams, the
    // same round-trip the casing test above relies on.
    mockParams = new URLSearchParams("q=react");
    rerender(<HeaderSearch />);

    // Following a search result to /posts/123 — the box still has "react".
    mockPathname = "/posts/123";
    mockParams = new URLSearchParams("");
    rerender(<HeaderSearch />);
    settle();
    expect(push).not.toHaveBeenCalled();

    // And any other navigation away behaves the same way.
    mockPathname = "/settings";
    rerender(<HeaderSearch />);
    settle();
    expect(push).not.toHaveBeenCalled();
  });

  it("still navigates for a genuinely new term typed after leaving /posts", () => {
    mockPathname = "/posts";
    mockParams = new URLSearchParams("");
    const { rerender } = render(<HeaderSearch />);
    type("react");
    settle();
    mockParams = new URLSearchParams("q=react");
    rerender(<HeaderSearch />);
    push.mockClear();

    mockPathname = "/posts/123";
    mockParams = new URLSearchParams("");
    rerender(<HeaderSearch />);
    settle();
    expect(push).not.toHaveBeenCalled();

    type("vue");
    settle();
    expect(push).toHaveBeenCalledWith("/posts?q=vue");
  });

  // Regression: the search box only cleared when navigating to bare /posts
  // (the Feed link) — anywhere else it kept showing the old term even though
  // nothing on screen matched it anymore, because the code that adopts an
  // external URL change into the box only ran while still on /posts.
  it("clears once the reader navigates away from /posts to anywhere else", () => {
    mockPathname = "/posts";
    mockParams = new URLSearchParams("");
    const { rerender } = render(<HeaderSearch />);
    type("react");
    settle();
    mockParams = new URLSearchParams("q=react");
    rerender(<HeaderSearch />);
    expect(input()?.value).toBe("react");

    mockPathname = "/posts/create";
    mockParams = new URLSearchParams("");
    rerender(<HeaderSearch />);
    expect(input()?.value).toBe("");
  });

  it("still navigates for the same term retyped after leaving /posts", () => {
    mockPathname = "/posts";
    mockParams = new URLSearchParams("");
    const { rerender } = render(<HeaderSearch />);
    type("react");
    settle();
    mockParams = new URLSearchParams("q=react");
    rerender(<HeaderSearch />);
    push.mockClear();

    mockPathname = "/posts/create";
    mockParams = new URLSearchParams("");
    rerender(<HeaderSearch />);
    settle();
    expect(input()?.value).toBe("");

    type("react");
    settle();
    expect(push).toHaveBeenCalledWith("/posts?q=react");
  });
});
