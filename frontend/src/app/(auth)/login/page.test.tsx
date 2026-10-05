import { useLogin } from "@/features/auth/mutations/auth-mutations";
import { render, screen } from "@testing-library/react";
import { useRouter, useSearchParams } from "next/navigation";
import LoginPage from "./page";

// The page is only composition, so this checks the composition: that the login
// page really puts the session-expired notice in front of the form when the URL
// asks for it, and shows the plain form otherwise. The form and the notice have
// their own tests; the mutation hook is mocked because no request is involved.
jest.mock("@/features/auth/mutations/auth-mutations");
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockUseLogin = useLogin as jest.MockedFunction<typeof useLogin>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;

function atUrl(query: string) {
  mockUseSearchParams.mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRouter.mockReturnValue({ push: jest.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
  mockUseLogin.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    mutate: jest.fn(),
  } as unknown as ReturnType<typeof useLogin>);
});

describe("login page", () => {
  it("shows the session-expired notice above the form after a session ends", () => {
    atUrl("reason=session-expired");
    render(<LoginPage />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Your session has expired");
    // Inside the form, ahead of the fields, so it reads before the inputs.
    const email = screen.getByPlaceholderText("you@example.com");
    expect(
      notice.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows no notice for an ordinary visit", () => {
    atUrl("");
    render(<LoginPage />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("keeps the form's own error alert separate from the notice", () => {
    atUrl("reason=session-expired");
    mockUseLogin.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("Invalid credentials"),
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useLogin>);
    render(<LoginPage />);

    expect(screen.getByRole("status")).toHaveTextContent("session has expired");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
  });
});
