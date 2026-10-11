import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrBody } from "./pr-body";

describe("PrBody", () => {
  it("renders the description as text", () => {
    render(<PrBody body="Fixes the login cookie flags." />);
    expect(
      screen.getByText("Fixes the login cookie flags."),
    ).toBeInTheDocument();
  });

  it("preserves line breaks", () => {
    render(<PrBody body={"line one\nline two"} />);
    const paragraph = screen.getByText(/line one/);
    // The newline is kept in the text, and whitespace-pre-wrap makes the
    // browser draw it as a line break.
    expect(paragraph.textContent).toBe("line one\nline two");
    expect(paragraph).toHaveClass("whitespace-pre-wrap");
    expect(paragraph).toHaveClass("break-words");
  });

  it("shows an empty state when there is no description", () => {
    render(<PrBody body="" />);
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
  });

  it("shows an empty state for a missing or whitespace-only body", () => {
    const { rerender } = render(<PrBody />);
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
    rerender(<PrBody body={"   \n  "} />);
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
  });

  it("shows HTML and Markdown from the PR author as literal text", () => {
    const body = '<script>alert(1)</script><img src="x" onerror="y()">\n## Heading';
    const { container } = render(<PrBody body={body} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("h2")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain("## Heading");
  });

  it("does not show a toggle for a short description", () => {
    render(<PrBody body="short" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("collapses a long description and expands it on request", async () => {
    render(<PrBody body={"word ".repeat(300)} />);
    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    const less = screen.getByRole("button", { name: "Show less" });
    expect(less).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(less);
    expect(
      screen.getByRole("button", { name: "Show more" }),
    ).toBeInTheDocument();
  });
});
