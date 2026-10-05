import { ROUTES } from "@/constants/routes";
import { useLogin } from "@/features/auth/mutations/auth-mutations";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { LoginForm } from "./login-form";

// The mutation hook is mocked, not the API underneath it: this suite cares
// about the form's own wiring (validation gates the submit, pending disables
// the button, the error banner, the redirect on success), not the request.
// mutations/auth-forms.integration.test.tsx runs the same forms through the real hook.
jest.mock("@/features/auth/mutations/auth-mutations");
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockUseLogin = useLogin as jest.MockedFunction<typeof useLogin>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

const mutate = jest.fn();
const push = jest.fn();

function fakeMutation(overrides: Partial<ReturnType<typeof useLogin>> = {}) {
  return {
    isPending: false,
    isError: false,
    error: null,
    mutate,
    ...overrides,
  } as unknown as ReturnType<typeof useLogin>;
}

// Each field sits in a <label> whose first <span> is its name. Finding it that
// way avoids getByLabelText, which also sees the password show/hide button
// that shares the label.
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
  mockUseLogin.mockReturnValue(fakeMutation());
});

describe("LoginForm", () => {
  it("shows a field error for each empty field and does not submit", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("shows the email format error and does not submit", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(field(/^email$/i), "not-an-email");
    await user.type(field(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("submits the email and password when both are valid", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(field(/^email$/i), "ada@example.com");
    await user.type(field(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { email: "ada@example.com", password: "secret" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("sends the user to the feed when the login succeeds", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(field(/^email$/i), "ada@example.com");
    await user.type(field(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const options = mutate.mock.calls[0][1] as { onSuccess: () => void };
    expect(push).not.toHaveBeenCalled();
    options.onSuccess();
    expect(push).toHaveBeenCalledWith(ROUTES.POSTS);
  });

  it("disables the button and says so while the request is pending", () => {
    mockUseLogin.mockReturnValue(fakeMutation({ isPending: true }));
    render(<LoginForm />);

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  });

  it("shows the server's error message in an alert", () => {
    mockUseLogin.mockReturnValue(
      fakeMutation({ isError: true, error: new Error("Invalid credentials") }),
    );
    render(<LoginForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
  });

  it("falls back to a generic message when the error is not an Error", () => {
    mockUseLogin.mockReturnValue(
      fakeMutation({ isError: true, error: "boom" as never }),
    );
    render(<LoginForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("Login failed.");
  });

  it("renders a notice passed in, above the fields and inside the form", () => {
    render(<LoginForm notice={<p role="status">Heads up</p>} />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Heads up");
    expect(notice.closest("form")).not.toBeNull();
    expect(
      notice.compareDocumentPosition(field(/^email$/i)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no notice by default", () => {
    render(<LoginForm />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a notice and the server's error alert apart", () => {
    mockUseLogin.mockReturnValue(
      fakeMutation({ isError: true, error: new Error("Invalid credentials") }),
    );
    render(<LoginForm notice={<p role="status">Heads up</p>} />);

    expect(screen.getByRole("status")).toHaveTextContent("Heads up");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
  });
});
