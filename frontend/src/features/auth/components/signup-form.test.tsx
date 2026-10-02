import { ROUTES } from "@/constants/routes";
import { useSignup } from "@/features/auth/mutations/auth-mutations";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { SignupForm } from "./signup-form";

// Same approach as login-form.test.tsx: the hook is mocked, the form's own
// behaviour is what is under test.
jest.mock("@/features/auth/mutations/auth-mutations");
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockUseSignup = useSignup as jest.MockedFunction<typeof useSignup>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

const mutate = jest.fn();
const push = jest.fn();

function fakeMutation(overrides: Partial<ReturnType<typeof useSignup>> = {}) {
  return {
    isPending: false,
    isError: false,
    error: null,
    mutate,
    ...overrides,
  } as unknown as ReturnType<typeof useSignup>;
}

function field(name: RegExp): HTMLInputElement {
  const span = screen.getByText(name, { selector: "label > span" });
  return (span.closest("label") as HTMLLabelElement).querySelector(
    "input",
  ) as HTMLInputElement;
}

async function fillValid(
  user: ReturnType<typeof userEvent.setup>,
  confirm = "long-enough-1",
) {
  await user.type(field(/^full name$/i), "  Ada Lovelace  ");
  await user.type(field(/^email$/i), "ada@example.com");
  await user.type(field(/^password$/i), "long-enough-1");
  await user.type(field(/^confirm password$/i), confirm);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRouter.mockReturnValue({ push } as unknown as ReturnType<
    typeof useRouter
  >);
  mockUseSignup.mockReturnValue(fakeMutation());
});

describe("SignupForm", () => {
  it("shows a field error for each empty field and does not submit", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Full name must be at least 2 characters"),
    ).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(
      screen.getByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Please confirm your password"),
    ).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("shows 'Passwords do not match' and does not submit when the confirmation differs", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillValid(user, "something-else-1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Passwords do not match"),
    ).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("submits the trimmed name, email and password, and never the confirmation", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        password: "long-enough-1",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("sends the user to the feed when the signup succeeds", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    const options = mutate.mock.calls[0][1] as { onSuccess: () => void };
    expect(push).not.toHaveBeenCalled();
    options.onSuccess();
    expect(push).toHaveBeenCalledWith(ROUTES.POSTS);
  });

  it("disables the button and says so while the request is pending", () => {
    mockUseSignup.mockReturnValue(fakeMutation({ isPending: true }));
    render(<SignupForm />);

    expect(
      screen.getByRole("button", { name: "Creating account…" }),
    ).toBeDisabled();
  });

  it("shows the server's error message in an alert", () => {
    mockUseSignup.mockReturnValue(
      fakeMutation({ isError: true, error: new Error("Email already in use") }),
    );
    render(<SignupForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("Email already in use");
  });

  it("falls back to a generic message when the error is not an Error", () => {
    mockUseSignup.mockReturnValue(
      fakeMutation({ isError: true, error: "boom" as never }),
    );
    render(<SignupForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("Signup failed.");
  });
});
