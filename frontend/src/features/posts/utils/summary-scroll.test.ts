import { scrollSummaryIntoView } from "./summary-scroll";

type Queries = { sideBySide?: boolean; reducedMotion?: boolean };

function setMedia({ sideBySide = false, reducedMotion = false }: Queries) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: query.includes("min-width")
      ? sideBySide
      : query.includes("prefers-reduced-motion")
        ? reducedMotion
        : false,
  })) as unknown as typeof window.matchMedia;
}

function panel() {
  const el = document.createElement("div");
  el.scrollIntoView = jest.fn();
  return el;
}

afterEach(() => {
  // jsdom has no matchMedia; put it back to that.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("scrollSummaryIntoView", () => {
  it("scrolls the stacked panel to the top of the screen, smoothly", () => {
    setMedia({});
    const el = panel();
    scrollSummaryIntoView(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("does nothing when the panel is already beside the post", () => {
    setMedia({ sideBySide: true });
    const el = panel();
    scrollSummaryIntoView(el);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("jumps instead of animating for a reader who prefers reduced motion", () => {
    setMedia({ reducedMotion: true });
    const el = panel();
    scrollSummaryIntoView(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("treats a browser without matchMedia as the stacked layout", () => {
    const el = panel();
    scrollSummaryIntoView(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("does nothing without an element", () => {
    setMedia({});
    expect(() => scrollSummaryIntoView(null)).not.toThrow();
  });
});
