import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedTabs } from "./feed-tabs";

function setup(value: "latest" | "top" | "discussed" = "latest") {
  const onChange = jest.fn();
  render(<FeedTabs value={value} onChange={onChange} idBase="t" panelId="p" />);
  const tabs = screen.getAllByRole("tab");
  return { onChange, tabs, user: userEvent.setup() };
}

describe("FeedTabs", () => {
  it("shows Top, Latest, Most Discussed in that order", () => {
    const { tabs } = setup();
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Top",
      "Latest",
      "Most Discussed",
    ]);
    expect(
      screen.getByRole("tablist", { name: "Sort posts" }),
    ).toBeInTheDocument();
  });

  it("marks only the current value selected and focusable", () => {
    const { tabs } = setup("top");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    for (const tab of tabs) expect(tab).toHaveAttribute("aria-controls", "p");
  });

  it("reports the clicked tab", async () => {
    const { tabs, onChange, user } = setup();
    await user.click(tabs[2]);
    expect(onChange).toHaveBeenCalledWith("discussed");
  });

  it("moves focus with the arrow keys without selecting", async () => {
    const { tabs, onChange, user } = setup("latest");
    tabs[1].focus();

    await user.keyboard("{ArrowRight}");
    expect(tabs[2]).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tabs[2]).toHaveFocus();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("jumps to the first and last tab with Home and End", async () => {
    const { tabs, user } = setup("latest");
    tabs[1].focus();
    await user.keyboard("{End}");
    expect(tabs[2]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
  });

  it("selects the focused tab on Enter and on Space", async () => {
    const { tabs, onChange, user } = setup("latest");
    tabs[0].focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("top");

    tabs[2].focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith("discussed");
  });
});
