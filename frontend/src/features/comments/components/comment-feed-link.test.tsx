import { render, screen } from "@testing-library/react";
import { CommentFeedLink } from "./comment-feed-link";

describe("CommentFeedLink", () => {
  it("shows the comment count and links to the post with ?comment=1", () => {
    render(<CommentFeedLink postId="post-1" commentCount={4} />);

    const link = screen.getByRole("link", { name: "4 Comments" });
    expect(link).toHaveAttribute("href", "/posts/post-1?comment=1");
  });
});
