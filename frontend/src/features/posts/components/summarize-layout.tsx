"use client";

import { SummarizeButton } from "@/features/posts/components/summarize-button";
import { SummarizePanel } from "@/features/posts/components/summarize-panel";
import { useSummarizeAction } from "@/features/posts/hooks/use-summarize-action";
import { scrollSummaryIntoView } from "@/features/posts/utils/summary-scroll";
import { useEffect, useRef, type ReactNode } from "react";

type SummarizeLayoutProps = {
  postId: string;
  // Above the post (the "Back to feed" link), in the post's own column.
  top?: ReactNode;
  // The post itself. It is handed the Summarize button to place in its author
  // row, because the button and the panel are in different places but share
  // one piece of state.
  post: (summarizeButton: ReactNode) => ReactNode;
  // Below the post (the comments), in the post's own column.
  after?: ReactNode;
};

// Owns the summarize state for one post and lays the page out around it: the
// post (with the button) on the left, the summary panel on the right on wide
// screens, and the panel directly under the post on narrow ones. The panel
// does not exist until the reader asks for a summary, and until then the page
// is the same single column as before.
//
// Render it with key={postId}. The summary lives in this component's state, so
// the key is what stops one post's summary showing on the next post when the
// page is reused for another id.
export function SummarizeLayout({
  postId,
  top,
  post,
  after,
}: SummarizeLayoutProps) {
  const action = useSummarizeAction(postId);

  // Where the panel sits when the layout stacks it under the post. On a phone
  // the reader taps Summarize at the top of a long post, so when the panel
  // opens, or a new request starts, bring it into view. Skipped when it is
  // beside the post instead (see scrollSummaryIntoView).
  const panelRef = useRef<HTMLDivElement>(null);
  const wasVisible = useRef(false);
  const wasPending = useRef(false);
  const { panelVisible, isPending } = action;
  useEffect(() => {
    const opened = panelVisible && !wasVisible.current;
    const started = isPending && !wasPending.current;
    wasVisible.current = panelVisible;
    wasPending.current = isPending;
    if (opened || started) scrollSummaryIntoView(panelRef.current);
  }, [panelVisible, isPending]);

  return (
    <div
      className={`mx-auto grid w-full max-w-2xl grid-cols-1 ${
        action.panelVisible
          ? "lg:max-w-6xl lg:grid-cols-[minmax(0,42rem)_auto] lg:justify-center lg:gap-x-6"
          : ""
      }`}
    >
      {/* Always mounted, even while the panel is not, so a screen reader
          announces each message as it changes (a region that appears
          together with its text is often not announced). It carries the
          messages; the panel only shows them. Focus never moves: it stays on
          the button. */}
      <div role="status" className="sr-only">
        {action.announcement}
      </div>

      {top && <div className="lg:col-start-1">{top}</div>}
      <div className="min-w-0 lg:col-start-1">
        {post(<SummarizeButton action={action} />)}
      </div>
      {action.panelVisible && (
        // Starts on the post's own row, so its top lines up with the top of
        // the post card and not with the "Back to feed" link above it. Without
        // a `top`, the post is the first row.
        // scroll-mt-20 leaves room for the sticky header (4rem) when this is
        // scrolled into view. The panel's column is `auto`, so on wide screens
        // its width follows its content: at least 18rem, wider when the header
        // (title plus the "Mock summary" label) or the text needs it, and never
        // past 24rem. The post's column gives up the difference.
        <div
          ref={panelRef}
          className={`mt-4 scroll-mt-20 lg:col-start-2 lg:row-span-2 lg:mt-0 lg:min-w-72 lg:max-w-sm ${
            top ? "lg:row-start-2" : "lg:row-start-1"
          }`}
        >
          <SummarizePanel action={action} />
        </div>
      )}
      {after && <div className="min-w-0 lg:col-start-1">{after}</div>}
    </div>
  );
}
