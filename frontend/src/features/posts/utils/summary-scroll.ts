// Tailwind's `lg` breakpoint (64rem). From here up the summary panel sits
// beside the post, already on screen; below it the panel is a card stacked
// under the post, which on a phone or a tablet in portrait is a long scroll
// away from the Summarize button at the top.
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// jsdom and some embedded browsers have no matchMedia: treat that as "can't
// tell", which means the stacked layout.
function matches(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

// Brings the summary panel into view when the layout stacks it under the post.
// Does nothing when it is already beside the post. Only scrolls: keyboard
// focus stays where it is (on the Summarize button), and the live region
// announces what happened.
export function scrollSummaryIntoView(panel: HTMLElement | null) {
  if (!panel || matches(SIDE_BY_SIDE_QUERY)) return;
  panel.scrollIntoView({
    behavior: matches(REDUCED_MOTION_QUERY) ? "auto" : "smooth",
    block: "start",
  });
}
