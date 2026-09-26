import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactionButtons } from "./reaction-buttons";

describe("ReactionButtons", () => {
  it("calls onToggle with the right type for like and dislike", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <ReactionButtons
        likeCount={2}
        dislikeCount={1}
        myReaction={null}
        mode="interactive"
        pending={false}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Like, 2" }));
    await user.click(screen.getByRole("button", { name: "Dislike, 1" }));

    expect(onToggle).toHaveBeenNthCalledWith(1, "like");
    expect(onToggle).toHaveBeenNthCalledWith(2, "dislike");
  });

  it("reflects myReaction in aria-pressed", () => {
    const { rerender } = render(
      <ReactionButtons
        likeCount={2}
        dislikeCount={1}
        myReaction="like"
        mode="interactive"
        pending={false}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Like, 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Dislike, 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    rerender(
      <ReactionButtons
        likeCount={2}
        dislikeCount={1}
        myReaction="dislike"
        mode="interactive"
        pending={false}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Like, 2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Dislike, 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    rerender(
      <ReactionButtons
        likeCount={2}
        dislikeCount={1}
        myReaction={null}
        mode="interactive"
        pending={false}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Like, 2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Dislike, 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks buttons aria-disabled and ignores clicks while pending", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <ReactionButtons
        likeCount={2}
        dislikeCount={1}
        myReaction={null}
        mode="interactive"
        pending={true}
        onToggle={onToggle}
      />,
    );

    const likeButton = screen.getByRole("button", { name: "Like, 2" });
    expect(likeButton).toHaveAttribute("aria-disabled", "true");

    await user.click(likeButton);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("signed-out: a click reveals the sign-in link instead of calling onToggle", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <ReactionButtons
        likeCount={2}
        dislikeCount={1}
        myReaction={null}
        mode="signed-out"
        pending={false}
        onToggle={onToggle}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Like, 2" }));

    expect(onToggle).not.toHaveBeenCalled();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/login");
    // Inside the live region, so a screen reader announces it.
    expect(screen.getByRole("status")).toContainElement(link);
  });

  it("read-only: renders no buttons, only the counts", () => {
    render(
      <ReactionButtons
        likeCount={5}
        dislikeCount={2}
        myReaction={null}
        mode="read-only"
        pending={false}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows errorMessage in the status region, and the region exists without one", () => {
    const { rerender } = render(
      <ReactionButtons
        likeCount={0}
        dislikeCount={0}
        myReaction={null}
        mode="interactive"
        pending={false}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("");

    rerender(
      <ReactionButtons
        likeCount={0}
        dislikeCount={0}
        myReaction={null}
        mode="interactive"
        pending={false}
        errorMessage="Couldn't save your reaction"
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't save your reaction",
    );
  });

  it("renders the counts as given, including 0", () => {
    render(
      <ReactionButtons
        likeCount={0}
        dislikeCount={0}
        myReaction={null}
        mode="interactive"
        pending={false}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Like, 0" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dislike, 0" }),
    ).toBeInTheDocument();
  });
});
