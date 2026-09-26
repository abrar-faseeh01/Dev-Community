import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactionSummary } from "./reaction-summary";

describe("ReactionSummary", () => {
  it("renders nothing when nobody has reacted", () => {
    const { container } = render(
      <ReactionSummary
        likeCount={0}
        dislikeCount={0}
        myReaction={null}
        onOpen={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the wording for the counts and the viewer's reaction", () => {
    render(
      <ReactionSummary
        likeCount={15}
        dislikeCount={1}
        myReaction="like"
        onOpen={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "You and 15 others reacted." }),
    ).toBeInTheDocument();
  });

  it("opens the list when clicked", async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn();
    render(
      <ReactionSummary
        likeCount={2}
        dislikeCount={0}
        myReaction={null}
        onOpen={onOpen}
      />,
    );

    await user.click(screen.getByRole("button", { name: "2 people reacted." }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("says it opens a dialog, for assistive technology", () => {
    render(
      <ReactionSummary
        likeCount={1}
        dislikeCount={0}
        myReaction="like"
        onOpen={jest.fn()}
      />,
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-haspopup", "dialog");
  });
});
