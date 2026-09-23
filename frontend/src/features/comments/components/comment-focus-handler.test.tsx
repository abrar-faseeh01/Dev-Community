import { render } from "@testing-library/react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  COMMENT_COMPOSER_CONTAINER_ID,
  COMMENTS_HEADING_ID,
} from "@/features/comments/utils/comment-focus";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CommentFocusHandler } from "./comment-focus-handler";

jest.mock("@/features/auth/hooks/use-auth");
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

const USER = { id: "u1", fullName: "U", email: "u@example.com", role: "user" as const };
const ADMIN = { id: "a1", fullName: "A", email: "a@example.com", role: "admin" as const };

const replace = jest.fn();

function setQuery(query: string) {
  mockUseSearchParams.mockReturnValue(
    new URLSearchParams(query) as ReturnType<typeof useSearchParams>,
  );
}

describe("CommentFocusHandler", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/posts/post-1");
    mockUseRouter.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("does nothing when ?comment=1 isn't present", () => {
    setQuery("");
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<CommentFocusHandler postLoaded />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("waits for auth to settle before doing anything", () => {
    setQuery("comment=1");
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(<CommentFocusHandler postLoaded />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /login when logged out, even before the post has loaded", () => {
    setQuery("comment=1");
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<CommentFocusHandler postLoaded={false} />);

    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("waits for the post to load before scrolling/focusing a logged-in viewer", () => {
    setQuery("comment=1");
    mockUseAuth.mockReturnValue({ user: USER, loading: false });
    document.body.innerHTML = `<div id="${COMMENT_COMPOSER_CONTAINER_ID}"><textarea></textarea></div>`;

    render(<CommentFocusHandler postLoaded={false} />);

    expect(replace).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).not.toHaveFocus();
  });

  it("focuses the composer's textarea for a 'user' viewer and strips the param", () => {
    setQuery("comment=1");
    mockUseAuth.mockReturnValue({ user: USER, loading: false });
    document.body.innerHTML = `<div id="${COMMENT_COMPOSER_CONTAINER_ID}"><textarea></textarea></div>`;
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;

    render(<CommentFocusHandler postLoaded />);

    expect(textarea).toHaveFocus();
    expect(replace).toHaveBeenCalledWith("/posts/post-1", { scroll: false });
  });

  it("focuses the comments heading for an admin, not a composer", () => {
    setQuery("comment=1");
    mockUseAuth.mockReturnValue({ user: ADMIN, loading: false });
    document.body.innerHTML = `<h2 id="${COMMENTS_HEADING_ID}" tabindex="-1"></h2>`;
    const heading = document.getElementById(COMMENTS_HEADING_ID) as HTMLElement;

    render(<CommentFocusHandler postLoaded />);

    expect(heading).toHaveFocus();
  });

  it("keeps other query params when stripping ?comment=1", () => {
    setQuery("comment=1&notice=post-deleted");
    mockUseAuth.mockReturnValue({ user: USER, loading: false });
    document.body.innerHTML = `<div id="${COMMENT_COMPOSER_CONTAINER_ID}"><textarea></textarea></div>`;

    render(<CommentFocusHandler postLoaded />);

    expect(replace).toHaveBeenCalledWith("/posts/post-1?notice=post-deleted", {
      scroll: false,
    });
  });
});
