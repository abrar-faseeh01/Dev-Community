import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types/user";
import { ApiError } from "@/lib/axios/api-error";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PostSummary } from "../types/post";
import { SummarizeLayout } from "./summarize-layout";

// The service and useAuth are mocked; the real hook, query client and
// components run. The mocked function is fetched with requireMock rather than
// imported: components (tests included) must not import the API layer, and
// lint enforces that.
jest.mock("@/services/api/posts");
jest.mock("@/features/auth/hooks/use-auth");
const { summarizePost: mockSummarize } = jest.requireMock<{
  summarizePost: jest.MockedFunction<
    typeof import("@/services/api/posts").summarizePost
  >;
}>("@/services/api/posts");
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};
const ADMIN: AuthUser = { ...USER, id: "a1", role: "admin" };

const SUMMARY: PostSummary = {
  summary: "Explains useState. Contrasts it with the DOM. Covers Vite.",
  tags: ["React", "NestJS"],
  source: "gemini",
  truncated: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Stands in for the post page: the layout hands the button to whatever renders
// the post, like PostPageView does with PostDetail's author row.
function Layout({ postId }: { postId: string }) {
  return (
    <SummarizeLayout
      key={postId}
      postId={postId}
      top={<Link href="/posts">Back to feed</Link>}
      post={(button) => (
        <article>
          <h1>Post title</h1>
          <div>{button}</div>
        </article>
      )}
      after={<section aria-label="Comments">Comments here</section>}
    />
  );
}

function renderLayout(postId = "post-1") {
  return render(<Layout postId={postId} />, { wrapper: makeWrapper() });
}

const summarizeButton = () =>
  screen.getByRole("button", {
    name: /^(Summarize|Summarizing…|Summarize again|Try again)$/,
  });
const panel = () => screen.queryByRole("complementary", { name: "AI summarizer" });
const liveRegion = () => screen.getByRole("status");

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: USER, loading: false });
});

describe("SummarizeLayout", () => {
  describe("before anything is requested", () => {
    it("shows the post, the button and the comments, but no panel", () => {
      renderLayout();

      expect(screen.getByRole("heading", { name: "Post title" })).toBeVisible();
      expect(summarizeButton()).toHaveTextContent("Summarize");
      expect(screen.getByRole("link", { name: "Back to feed" })).toBeVisible();
      expect(screen.getByText("Comments here")).toBeVisible();
      expect(panel()).toBeNull();
    });

    it("has an empty live region ready to announce later changes", () => {
      renderLayout();
      expect(liveRegion()).toBeEmptyDOMElement();
    });
  });

  describe("success", () => {
    it("opens the panel with the summary as bullets and the tags as #chips", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());

      const aside = await screen.findByRole("complementary", {
        name: "AI summarizer",
      });
      expect(within(aside).getByRole("heading", { name: "AI Summarizer" }))
        .toBeVisible();
      expect(mockSummarize).toHaveBeenCalledWith("post-1");

      const points = within(
        within(aside).getByRole("list", { name: "Summary points" }),
      ).getAllByRole("listitem");
      expect(points.map((li) => li.textContent)).toEqual([
        "Explains useState.",
        "Contrasts it with the DOM.",
        "Covers Vite.",
      ]);

      const tags = within(within(aside).getByRole("list", { name: "Tags" }))
        .getAllByRole("listitem")
        .map((li) => li.textContent);
      expect(tags).toEqual(["#React", "#NestJS"]);
    });

    it("keeps the panel after the post and before the comments in reading order", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      const { container } = renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("complementary", { name: "AI summarizer" });

      const order = [
        screen.getByRole("heading", { name: "Post title" }),
        screen.getByRole("complementary"),
        screen.getByText("Comments here"),
      ];
      const positions = order.map((el) =>
        Array.from(container.querySelectorAll("*")).indexOf(el),
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it("keeps the card's title and the mock label on one line each", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue({ ...SUMMARY, source: "mock" });
      renderLayout();

      await user.click(summarizeButton());
      const aside = await screen.findByRole("complementary");

      // jsdom has no layout, so this checks the classes that stop wrapping.
      expect(
        within(aside).getByRole("heading", { name: "AI Summarizer" }),
      ).toHaveClass("whitespace-nowrap");
      const label = within(aside).getByText("Mock summary");
      expect(label).toHaveClass("whitespace-nowrap", "shrink-0");
    });

    it("sizes the card to its content on wide screens, between 18rem and 24rem", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());
      const cell = (await screen.findByRole("complementary")).parentElement;

      expect(cell).toHaveClass("lg:min-w-72", "lg:max-w-sm");
      // The grid's second column follows the card instead of a fixed width.
      expect(cell?.parentElement?.className).toContain("_auto]");
      expect(cell?.parentElement?.className).not.toMatch(/_\d+rem\]/);
    });

    it("starts the panel on the post's row, not the back link's row", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());
      const cell = (await screen.findByRole("complementary")).parentElement;

      // Row 1 holds the "Back to feed" link, so the post (and the panel
      // beside it) start on row 2.
      expect(cell).toHaveClass("lg:row-start-2");
      expect(cell).not.toHaveClass("lg:row-start-1");
    });

    it("starts the panel on the first row when there is nothing above the post", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      render(
        <SummarizeLayout
          postId="post-1"
          post={(button) => <article>{button}</article>}
        />,
        { wrapper: makeWrapper() },
      );

      await user.click(summarizeButton());
      const cell = (await screen.findByRole("complementary")).parentElement;

      expect(cell).toHaveClass("lg:row-start-1");
      expect(cell).not.toHaveClass("lg:row-start-2");
    });

    it("announces the result, relabels the button and keeps keyboard focus on it", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("complementary");

      expect(liveRegion()).toHaveTextContent("Summary ready.");
      expect(
        screen.getByRole("button", { name: "Summarize again" }),
      ).toHaveFocus();
    });

    it("labels a mock result so it is not mistaken for a model's", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue({ ...SUMMARY, source: "mock" });
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("complementary");

      expect(screen.getByText("Mock summary")).toBeInTheDocument();
    });

    it("does not show the mock label for a model result", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("complementary");

      expect(screen.queryByText("Mock summary")).not.toBeInTheDocument();
    });

    it("notes when only the first part of a long post was summarized", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue({ ...SUMMARY, truncated: true });
      renderLayout();

      await user.click(summarizeButton());

      expect(
        await screen.findByText(
          "Summary is based on the first part of this post",
        ),
      ).toBeInTheDocument();
    });

    it("shows no truncation note for a complete summary", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("complementary");

      expect(screen.queryByText(/first part of this post/)).toBeNull();
    });

    it("lets an admin summarize too", async () => {
      const user = userEvent.setup();
      mockUseAuth.mockReturnValue({ user: ADMIN, loading: false });
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());

      await screen.findByRole("complementary");
      expect(mockSummarize).toHaveBeenCalledTimes(1);
    });
  });

  describe("scrolling to the panel when it is stacked under the post", () => {
    const scrollSpy = Element.prototype.scrollIntoView as jest.Mock;

    function setSideBySide(sideBySide: boolean) {
      window.matchMedia = jest.fn((query: string) => ({
        matches: query.includes("min-width") ? sideBySide : false,
      })) as unknown as typeof window.matchMedia;
    }

    afterEach(() => {
      delete (window as { matchMedia?: unknown }).matchMedia;
    });

    it("scrolls to the panel when the reader clicks Summarize on a narrow screen", async () => {
      const user = userEvent.setup();
      setSideBySide(false);
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();
      expect(scrollSpy).not.toHaveBeenCalled();

      await user.click(summarizeButton());
      await screen.findByRole("list", { name: "Summary points" });

      expect(scrollSpy).toHaveBeenCalledTimes(1);
      // It scrolled the panel's own cell, not something else on the page.
      const cell = screen.getByRole("complementary").parentElement;
      expect(scrollSpy.mock.contexts[0]).toBe(cell);
      expect(scrollSpy).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    });

    it("does not scroll when the panel sits beside the post", async () => {
      const user = userEvent.setup();
      setSideBySide(true);
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("list", { name: "Summary points" });

      expect(scrollSpy).not.toHaveBeenCalled();
    });

    it("scrolls once per request, not again when the result arrives", async () => {
      const user = userEvent.setup();
      setSideBySide(false);
      const call = deferred<PostSummary>();
      mockSummarize.mockReturnValue(call.promise);
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("complementary");
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      await act(async () => call.resolve(SUMMARY));
      await screen.findByRole("list", { name: "Summary points" });

      expect(scrollSpy).toHaveBeenCalledTimes(1);
    });

    it("scrolls again when the reader summarizes again", async () => {
      const user = userEvent.setup();
      setSideBySide(false);
      // The second request stays in flight, like a real one over a network:
      // one that resolves instantly can finish before React ever renders its
      // pending state, which is what the scroll is keyed on.
      const second = deferred<PostSummary>();
      mockSummarize
        .mockResolvedValueOnce(SUMMARY)
        .mockReturnValueOnce(second.promise);
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("list", { name: "Summary points" });
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Summarize again" }));

      await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(2));
      expect(mockSummarize).toHaveBeenCalledTimes(2);
      await act(async () => second.resolve(SUMMARY));
    });

    it("scrolls to the sign-in hint too, so a signed-out tap is not silent", async () => {
      const user = userEvent.setup();
      setSideBySide(false);
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("complementary");

      expect(scrollSpy).toHaveBeenCalledTimes(1);
    });

    it("leaves keyboard focus on the button", async () => {
      const user = userEvent.setup();
      setSideBySide(false);
      mockSummarize.mockResolvedValue(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("list", { name: "Summary points" });

      expect(
        screen.getByRole("button", { name: "Summarize again" }),
      ).toHaveFocus();
    });
  });

  describe("untrusted content", () => {
    it("renders markup in the summary and tags as literal text", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue({
        summary: '<img src=x onerror="alert(1)"> **bold** <b>hi</b>',
        tags: ["<script>alert(1)</script>", "<b>x</b>"],
        source: "gemini",
        truncated: false,
      });
      const { container } = renderLayout();

      await user.click(summarizeButton());

      expect(
        await screen.findByText(
          '<img src=x onerror="alert(1)"> **bold** <b>hi</b>',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("#<b>x</b>")).toBeInTheDocument();
      expect(
        screen.getByText("#<script>alert(1)</script>"),
      ).toBeInTheDocument();
      // Nothing was parsed into real elements.
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("b")).toBeNull();
    });
  });

  describe("pending", () => {
    it("opens the panel at once, locks the button, keeps focus, and sends one request for repeated clicks", async () => {
      const user = userEvent.setup();
      const call = deferred<PostSummary>();
      mockSummarize.mockReturnValue(call.promise);
      renderLayout();

      const button = summarizeButton();
      await user.click(button);
      await waitFor(() =>
        expect(button).toHaveAttribute("aria-disabled", "true"),
      );
      expect(button).toHaveTextContent("Summarizing…");
      expect(liveRegion()).toHaveTextContent("Summarizing…");
      expect(
        within(screen.getByRole("complementary")).getByText("Summarizing…"),
      ).toBeVisible();
      expect(button).toHaveFocus();

      await user.click(button);
      await user.click(button);
      expect(mockSummarize).toHaveBeenCalledTimes(1);

      await act(async () => call.resolve(SUMMARY));
      await screen.findByRole("list", { name: "Summary points" });
    });

    it("sends one request even for two clicks in the same tick", async () => {
      mockSummarize.mockReturnValue(new Promise(() => {}));
      renderLayout();

      const button = summarizeButton();
      // No awaiting between them: the second click lands before React has
      // re-rendered with the pending state.
      fireEvent.click(button);
      fireEvent.click(button);

      await waitFor(() => expect(mockSummarize).toHaveBeenCalled());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(mockSummarize).toHaveBeenCalledTimes(1);
    });

    it("makes no request while the session is still loading", async () => {
      const user = userEvent.setup();
      mockUseAuth.mockReturnValue({ user: null, loading: true });
      renderLayout();

      const button = summarizeButton();
      expect(button).toHaveAttribute("aria-disabled", "true");
      await user.click(button);

      expect(mockSummarize).not.toHaveBeenCalled();
      expect(panel()).toBeNull();
    });
  });

  describe("signed out", () => {
    it("opens the panel with a sign-in hint and makes no request", async () => {
      const user = userEvent.setup();
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      renderLayout();

      await user.click(summarizeButton());

      const aside = screen.getByRole("complementary", {
        name: "AI summarizer",
      });
      expect(aside).toHaveTextContent("Sign in to summarize this post.");
      expect(
        within(aside).getByRole("link", { name: "Sign in" }),
      ).toHaveAttribute("href", "/login");
      expect(liveRegion()).toHaveTextContent("Sign in to summarize this post.");
      expect(mockSummarize).not.toHaveBeenCalled();
    });

    it("shows no panel until the button is used", () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      renderLayout();

      expect(panel()).toBeNull();
      expect(liveRegion()).toBeEmptyDOMElement();
    });
  });

  describe("failures", () => {
    it("shows the error in the panel, offers a retry, and recovers", async () => {
      const user = userEvent.setup();
      mockSummarize
        .mockRejectedValueOnce(new ApiError("down", [], 503))
        .mockResolvedValueOnce(SUMMARY);
      renderLayout();

      await user.click(summarizeButton());

      const message =
        "Summaries are temporarily unavailable. Please try again later.";
      await waitFor(() =>
        expect(liveRegion()).toHaveTextContent(message),
      );
      expect(screen.getByRole("complementary")).toHaveTextContent(message);
      const retry = screen.getByRole("button", { name: "Try again" });
      expect(retry).toHaveFocus();
      expect(retry).not.toHaveAttribute("aria-disabled");

      await user.click(retry);

      expect(
        await screen.findByRole("list", { name: "Summary points" }),
      ).toBeInTheDocument();
      expect(mockSummarize).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("complementary")).not.toHaveTextContent(
        "unavailable",
      );
    });

    it.each([
      [502, /unusable response/],
      [504, /took too long/],
      [429, /too quickly/],
      [undefined, /Couldn't reach the server/],
    ])("shows a retryable message for %s", async (status, wording) => {
      const user = userEvent.setup();
      mockSummarize.mockRejectedValue(new ApiError("x", [], status));
      renderLayout();

      await user.click(summarizeButton());

      await waitFor(() =>
        expect(screen.getByRole("complementary")).toHaveTextContent(wording),
      );
      expect(
        screen.getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
    });

    it("does not offer a retry for a post that is too short", async () => {
      const user = userEvent.setup();
      mockSummarize.mockRejectedValue(new ApiError("short", [], 422));
      renderLayout();

      await user.click(summarizeButton());

      await waitFor(() =>
        expect(screen.getByRole("complementary")).toHaveTextContent(
          "This post is too short to summarize.",
        ),
      );
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      const button = screen.getByRole("button", { name: "Summarize" });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveFocus();

      await user.click(button);
      expect(mockSummarize).toHaveBeenCalledTimes(1);
    });

    it("does not offer a retry for a post that is gone", async () => {
      const user = userEvent.setup();
      mockSummarize.mockRejectedValue(new ApiError("gone", [], 404));
      renderLayout();

      await user.click(summarizeButton());

      await waitFor(() =>
        expect(screen.getByRole("complementary")).toHaveTextContent(
          "This post is no longer available.",
        ),
      );
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });

    it("does not leave a summary showing after a later failure", async () => {
      const user = userEvent.setup();
      mockSummarize
        .mockResolvedValueOnce(SUMMARY)
        .mockRejectedValueOnce(new ApiError("down", [], 503));
      renderLayout();

      await user.click(summarizeButton());
      await screen.findByRole("list", { name: "Summary points" });

      await user.click(screen.getByRole("button", { name: "Summarize again" }));

      await waitFor(() =>
        expect(screen.getByRole("complementary")).toHaveTextContent(
          "temporarily unavailable",
        ),
      );
      expect(screen.queryByRole("list", { name: "Summary points" })).toBeNull();
    });
  });

  describe("moving between posts", () => {
    it("drops the previous post's summary and panel when rendered for another post", async () => {
      const user = userEvent.setup();
      mockSummarize.mockResolvedValue(SUMMARY);
      const { rerender } = render(<Layout postId="post-1" />, {
        wrapper: makeWrapper(),
      });

      await user.click(summarizeButton());
      await screen.findByRole("list", { name: "Summary points" });

      rerender(<Layout postId="post-2" />);

      expect(screen.queryByRole("list", { name: "Summary points" })).toBeNull();
      expect(panel()).toBeNull();
      expect(screen.getByRole("button", { name: "Summarize" })).toBeVisible();

      await user.click(summarizeButton());
      await waitFor(() => expect(mockSummarize).toHaveBeenCalledTimes(2));
      expect(mockSummarize).toHaveBeenLastCalledWith("post-2");
    });
  });
});
