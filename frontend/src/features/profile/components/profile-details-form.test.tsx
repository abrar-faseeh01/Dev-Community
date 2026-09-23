import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUpdateProfileDetails } from "@/features/profile/mutations/profile-mutations";
import type { Profile } from "@/features/profile/types/profile";
import { ProfileDetailsForm } from "./profile-details-form";

// The mutation hook is mocked, not the API underneath it — this suite only
// cares about the action bar's wiring (dirty/pending -> disabled, click ->
// mutate) and the hash-scroll-and-focus effect, not the save request itself.
jest.mock("@/features/profile/mutations/profile-mutations");

const mockUseUpdateProfileDetails =
  useUpdateProfileDetails as jest.MockedFunction<
    typeof useUpdateProfileDetails
  >;

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "profile-1",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    role: "user",
    headline: "Engineer",
    bio: "Bio",
    skills: [],
    experiences: [],
    portfolioProjects: [],
    ...overrides,
  };
}

function fakeMutation(
  overrides: Partial<ReturnType<typeof useUpdateProfileDetails>> = {},
) {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    mutate: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useUpdateProfileDetails>;
}

// Save changes portals into a slot rendered by the real page (ProfileEditShell,
// outside this component) — this stands in for that slot, attached to the
// document so screen queries (which search document.body) can find it.
function renderForm(props: Partial<Parameters<typeof ProfileDetailsForm>[0]> = {}) {
  const footerSlot = document.createElement("div");
  document.body.appendChild(footerSlot);
  const result = render(
    <ProfileDetailsForm
      profile={makeProfile()}
      isOwn
      footerSlot={footerSlot}
      {...props}
    />,
  );
  return { ...result, footerSlot };
}

describe("ProfileDetailsForm Save changes", () => {
  afterEach(() => {
    window.location.hash = "";
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("keeps Save changes disabled until the form is dirty, then submits via mutate", async () => {
    const mutate = jest.fn();
    mockUseUpdateProfileDetails.mockReturnValue(fakeMutation({ mutate }));
    renderForm();

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText("e.g. Full-stack developer"),
      "!",
    );
    expect(saveButton).not.toBeDisabled();

    await userEvent.click(saveButton);
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  });

  it("disables Save changes while the mutation is pending, even if dirty", () => {
    mockUseUpdateProfileDetails.mockReturnValue(
      fakeMutation({ isPending: true }),
    );
    renderForm();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("renders nothing into the footer slot until one is provided", () => {
    mockUseUpdateProfileDetails.mockReturnValue(fakeMutation());
    render(
      <ProfileDetailsForm
        profile={makeProfile()}
        isOwn
        footerSlot={null}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });
});

describe("ProfileDetailsForm hash-scroll-and-focus", () => {
  afterEach(() => {
    window.location.hash = "";
    jest.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("does nothing without a hash", () => {
    mockUseUpdateProfileDetails.mockReturnValue(fakeMutation());
    const scrollIntoView = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderForm();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to and focuses the Skills section when the hash is #skills", () => {
    mockUseUpdateProfileDetails.mockReturnValue(fakeMutation());
    window.location.hash = "#skills";
    const scrollIntoView = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderForm();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Skills" })).toHaveFocus();
  });

  it("scrolls to and focuses the Portfolio section when the hash is #portfolio", () => {
    mockUseUpdateProfileDetails.mockReturnValue(fakeMutation());
    window.location.hash = "#portfolio";
    const scrollIntoView = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderForm();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Portfolio projects" }),
    ).toHaveFocus();
  });
});
