"use client";

import {
  FEED_SORT_LABELS,
  FEED_SORT_ORDER,
  feedSortHref,
  parsePostSort,
  type PostSort,
} from "@/features/posts/utils/feed-sort";
import { useDismissible } from "@/hooks/use-dismissible";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

const menuItemClass =
  "rounded-lg px-3 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-neutral-800";

// The feed's sort control: a button that opens Top / Latest / Most Discussed
// as a dropdown, replacing the old tabs above the feed. Reads and writes
// ?sort= exactly as the tabs did — window.history.pushState, not
// router.push, so a transition through an already-revealed <Suspense>
// boundary can't hold the previous sort's posts on screen (see
// sorted-post-feed.tsx); a real navigation, so choosing a sort adds a history
// entry and Back steps between them.
//
// Hidden while a search is active (?q= present): sort has no meaning for
// search results, same reasoning post-search-results.tsx hides the feed for.
// This component only knows that from the URL, not from the header's
// HeaderSearch — the box that actually types into ?q= now lives in the
// site header, nowhere near this component in the tree.
export function FeedSortMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useDismissible({
    open,
    onDismiss: () => setOpen(false),
    containerRef,
    triggerRef: buttonRef,
  });

  const searchParams = useSearchParams();
  const pathname = usePathname();

  if (searchParams.get("q")) return null;

  const sort = parsePostSort(searchParams.get("sort"));

  function handleSelect(next: PostSort) {
    setOpen(false);
    if (next === sort) return;
    window.history.pushState(
      null,
      "",
      feedSortHref(pathname, searchParams, next),
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="feed-sort-menu"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
      >
        Sort: {FEED_SORT_LABELS[sort]}
        <span aria-hidden="true" className="text-xs text-neutral-400">
          ▾
        </span>
      </button>

      <div
        id="feed-sort-menu"
        role="menu"
        aria-label="Sort posts"
        className={`absolute left-0 top-[calc(100%+0.5rem)] z-10 w-44 origin-top-left overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-lg transition-all duration-150 ease-out ${
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-0.5 p-1.5">
          {FEED_SORT_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === sort}
              onClick={() => handleSelect(option)}
              className={`${menuItemClass} ${
                option === sort ? "bg-neutral-800" : ""
              }`}
            >
              {FEED_SORT_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
