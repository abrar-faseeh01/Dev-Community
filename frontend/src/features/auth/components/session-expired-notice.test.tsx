import { LOGIN_REASON_SESSION_EXPIRED, ROUTES } from "@/constants/routes";
import { render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import { SessionExpiredNotice } from "./session-expired-notice";

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;

function atUrl(query: string) {
  mockUseSearchParams.mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>,
  );
}

describe("SessionExpiredNotice", () => {
  it("tells the visitor their session expired when the interceptor sent them here", () => {
    atUrl("reason=session-expired");
    render(<SessionExpiredNotice />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session has expired. Sign in again to continue.",
    );
  });

  it("is a status message, not an alert (the form's error banner is the alert)", () => {
    atUrl("reason=session-expired");
    render(<SessionExpiredNotice />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("matches the exact URL the interceptor redirects to", () => {
    const [, query] = ROUTES.LOGIN_SESSION_EXPIRED.split("?");
    atUrl(query);
    render(<SessionExpiredNotice />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(query).toBe(`reason=${LOGIN_REASON_SESSION_EXPIRED}`);
  });

  it.each([
    ["no query string", ""],
    ["another page's parameter", "page=2"],
    ["a different reason", "reason=logged-out"],
    ["an empty reason", "reason="],
    ["a near miss", "reason=session-expired-now"],
    ["a different case", "reason=Session-Expired"],
  ])("shows nothing for %s", (_label, query) => {
    atUrl(query);
    const { container } = render(<SessionExpiredNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it("never renders text taken from the URL", () => {
    atUrl("reason=%3Cb%3Ehijacked%3C%2Fb%3E&message=hijacked");
    const { container } = render(<SessionExpiredNotice />);

    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toContain("hijacked");
  });
});
