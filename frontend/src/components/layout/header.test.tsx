import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types/user";
import { render, screen } from "@testing-library/react";
import { Header } from "./header";

jest.mock("next/navigation", () => ({
  usePathname: () => "/posts",
}));

jest.mock("@/features/auth/hooks/use-auth");
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

jest.mock("./header-search", () => ({
  HeaderSearch: () => null,
}));
jest.mock("./user-menu", () => ({
  UserMenu: () => <div>USER_MENU</div>,
}));
jest.mock("@/features/notifications/components/notification-bell", () => ({
  NotificationBell: () => <div>BELL</div>,
}));

const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};
const ADMIN: AuthUser = { ...USER, id: "a1", role: "admin" };

describe("Header — Create Post visibility", () => {
  it("shows Create Post for a signed-in member", () => {
    mockUseAuth.mockReturnValue({ user: USER, loading: false });
    render(<Header />);
    expect(screen.getByRole("link", { name: "Create Post" })).toBeInTheDocument();
  });

  it("hides Create Post for an admin", () => {
    mockUseAuth.mockReturnValue({ user: ADMIN, loading: false });
    render(<Header />);
    expect(
      screen.queryByRole("link", { name: "Create Post" }),
    ).not.toBeInTheDocument();
  });

  it("hides Create Post for a signed-out visitor", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<Header />);
    expect(
      screen.queryByRole("link", { name: "Create Post" }),
    ).not.toBeInTheDocument();
  });

  it("hides Create Post while the session is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(<Header />);
    expect(
      screen.queryByRole("link", { name: "Create Post" }),
    ).not.toBeInTheDocument();
  });
});
