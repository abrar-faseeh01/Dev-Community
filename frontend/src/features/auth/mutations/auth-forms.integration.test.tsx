import { ROUTES } from "@/constants/routes";
import { login, signup } from "@/services/api/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { authKeys } from "../queries/auth-queries";
import type { AuthUser } from "../types/user";
import { LoginForm } from "../components/login-form";
import { SignupForm } from "../components/signup-form";

// Integration-style: the real form, the real mutation hook and a real
// QueryClient. Only the HTTP layer (@/services/api/auth) and the router are
// mocked. What this adds over the form tests, which mock the hook: that
// submitting really calls the API with the right payload, that success lands
// the user in the auth cache and redirects, that a failure shows the server's
// message without redirecting, and that a failed signup never attempts the
// automatic login that follows it.
jest.mock("@/services/api/auth");
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockLogin = login as jest.MockedFunction<typeof login>;
const mockSignup = signup as jest.MockedFunction<typeof signup>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};

const push = jest.fn();

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return queryClient;
}

function field(name: RegExp): HTMLInputElement {
  const span = screen.getByText(name, { selector: "label > span" });
  return (span.closest("label") as HTMLLabelElement).querySelector(
    "input",
  ) as HTMLInputElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRouter.mockReturnValue({ push } as unknown as ReturnType<
    typeof useRouter
  >);
});

describe("LoginForm with the real mutation hook", () => {
  async function submit() {
    const user = userEvent.setup();
    await user.type(field(/^email$/i), "ada@example.com");
    await user.type(field(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("calls the API, stores the user in the auth cache and goes to the feed", async () => {
    mockLogin.mockResolvedValue(USER);
    const queryClient = renderWithClient(<LoginForm />);

    await submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.POSTS));
    expect(mockLogin.mock.calls[0][0]).toEqual({
      email: "ada@example.com",
      password: "secret",
    });
    expect(queryClient.getQueryData(authKeys.me)).toEqual(USER);
  });

  it("shows the server's message and stays put when the login is rejected", async () => {
    mockLogin.mockRejectedValue(new Error("Invalid credentials"));
    const queryClient = renderWithClient(<LoginForm />);

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid credentials",
    );
    expect(push).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(authKeys.me)).toBeUndefined();
  });
});

describe("SignupForm with the real mutation hook", () => {
  async function submit() {
    const user = userEvent.setup();
    await user.type(field(/^full name$/i), "Ada Lovelace");
    await user.type(field(/^email$/i), "ada@example.com");
    await user.type(field(/^password$/i), "long-enough-1");
    await user.type(field(/^confirm password$/i), "long-enough-1");
    await user.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("signs up, signs the new account straight in, stores the user and goes to the feed", async () => {
    mockSignup.mockResolvedValue(undefined);
    mockLogin.mockResolvedValue(USER);
    const queryClient = renderWithClient(<SignupForm />);

    await submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.POSTS));
    expect(mockSignup.mock.calls[0][0]).toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      password: "long-enough-1",
    });
    expect(mockLogin.mock.calls[0][0]).toEqual({
      email: "ada@example.com",
      password: "long-enough-1",
    });
    expect(queryClient.getQueryData(authKeys.me)).toEqual(USER);
  });

  it("shows the server's message and never tries to log in when the signup is rejected", async () => {
    mockSignup.mockRejectedValue(new Error("Email already in use"));
    const queryClient = renderWithClient(<SignupForm />);

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email already in use",
    );
    expect(mockLogin).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(authKeys.me)).toBeUndefined();
  });
});
