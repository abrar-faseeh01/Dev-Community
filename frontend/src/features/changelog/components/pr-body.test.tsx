import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrBody } from "./pr-body";

describe("PrBody", () => {
  it("renders Markdown as formatted elements", () => {
    render(<PrBody body={"## What changed\n\n- one\n- two"} />);
    expect(
      screen.getByRole("heading", { name: "What changed" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows an empty state when there is no description", () => {
    render(<PrBody body="" />);
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
  });

  it("does not render raw HTML, images or javascript: links from the PR author", () => {
    const { container } = render(
      <PrBody
        body={
          '<script>alert(1)</script><img src="https://evil.test/x.png">\n\n![pic](https://evil.test/y.png)\n\n[click](javascript:alert(1))'
        }
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const link = screen.getByText("click").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("opens links in a new tab safely", () => {
    render(<PrBody body="[docs](https://example.com)" />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("collapses a long description behind Show more", async () => {
    render(<PrBody body={"word ".repeat(300)} />);
    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });
});
