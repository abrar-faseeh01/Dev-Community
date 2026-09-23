import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useProfile } from "@/features/profile/queries/profile-queries";
import type { Profile } from "@/features/profile/types/profile";
import { ProfileView } from "./profile-view";

// useProfile is mocked (not the API underneath it), same convention as the
// comments suites — components may only reach the API through a hook. The
// Posts tab's MyPosts is stubbed out too: it isn't part of what this suite
// is checking (the per-tab Edit links), and stubbing it avoids also having
// to fake useMyPosts/QueryClientProvider for a tab these tests never open.
jest.mock("@/features/auth/hooks/use-auth");
jest.mock("@/features/profile/queries/profile-queries");
jest.mock("@/features/posts/components/my-posts", () => ({
  MyPosts: () => <div>posts-tab-stub</div>,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "profile-1",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    role: "user",
    headline: "Engineer",
    bio: "Bio",
    skills: ["TypeScript"],
    experiences: [],
    portfolioProjects: [],
    ...overrides,
  };
}

const PROFILE = makeProfile();

const OWNER = {
  id: PROFILE.id,
  fullName: PROFILE.fullName,
  email: PROFILE.email,
  role: "user" as const,
};
const ADMIN = {
  id: "admin-1",
  fullName: "Admin User",
  email: "admin@example.com",
  role: "admin" as const,
};
const OTHER_USER = {
  id: "other-1",
  fullName: "Other User",
  email: "other@example.com",
  role: "user" as const,
};

async function renderOnTab(tabName: string) {
  render(<ProfileView id={PROFILE.id} />);
  await userEvent.click(screen.getByRole("tab", { name: tabName }));
}

describe("ProfileView per-tab Edit links", () => {
  beforeEach(() => {
    mockUseProfile.mockReturnValue({
      data: PROFILE,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useProfile>);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the Portfolio and Skills Edit links to the profile owner", async () => {
    mockUseAuth.mockReturnValue({ user: OWNER, loading: false });
    await renderOnTab("Portfolio");
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows the Portfolio and Skills Edit links to an admin viewing someone else's profile", async () => {
    mockUseAuth.mockReturnValue({ user: ADMIN, loading: false });
    await renderOnTab("Portfolio");
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
  });

  it("hides the Portfolio and Skills Edit links from another signed-in user", async () => {
    mockUseAuth.mockReturnValue({ user: OTHER_USER, loading: false });
    await renderOnTab("Portfolio");
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("hides the Portfolio and Skills Edit links from a logged-out visitor", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    await renderOnTab("Portfolio");
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("shows the Experience tab's existing Edit link to the owner", async () => {
    mockUseAuth.mockReturnValue({ user: OWNER, loading: false });
    await renderOnTab("Experience");
    expect(
      screen.getByRole("link", { name: "Edit experience" }),
    ).toBeInTheDocument();
  });

  it("hides the Experience tab's Edit link from another signed-in user", async () => {
    mockUseAuth.mockReturnValue({ user: OTHER_USER, loading: false });
    await renderOnTab("Experience");
    expect(
      screen.queryByRole("link", { name: "Edit experience" }),
    ).not.toBeInTheDocument();
  });
});
