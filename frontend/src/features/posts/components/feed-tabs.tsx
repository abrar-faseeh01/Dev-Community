"use client";

import {
  FEED_SORT_LABELS,
  FEED_SORT_ORDER,
  type PostSort,
} from "@/features/posts/utils/feed-sort";
import { useRef, type KeyboardEvent } from "react";

type TabRefs = Partial<Record<PostSort, HTMLButtonElement | null>>;

// The id of one tab, so the panel it controls can point back at it.
export const feedTabId = (idBase: string, sort: PostSort) =>
  `${idBase}-tab-${sort}`;

type FeedTabsProps = {
  value: PostSort;
  onChange: (sort: PostSort) => void;
  idBase: string;
  panelId: string;
};

// Top / Latest / Most Discussed. Controlled: it shows `value` and reports a
// choice, and owns nothing else.
//
// Activation is manual. Left/Right/Home/End only move focus; Enter, Space or
// a click selects. Selecting pushes a history entry, so selecting on every
// arrow press would fill the history with entries and make Back step through
// them one by one.
export function FeedTabs({ value, onChange, idBase, panelId }: FeedTabsProps) {
  const tabRefs = useRef<TabRefs>({});

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = FEED_SORT_ORDER.length - 1;
    let target: number;
    if (e.key === "ArrowRight") target = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") target = index === 0 ? last : index - 1;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = last;
    else return;
    e.preventDefault();
    tabRefs.current[FEED_SORT_ORDER[target]]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Sort posts"
      className="mb-5 flex gap-1 border-b border-neutral-800"
    >
      {FEED_SORT_ORDER.map((sort, index) => {
        const selected = sort === value;
        return (
          <button
            key={sort}
            ref={(el) => {
              tabRefs.current[sort] = el;
            }}
            type="button"
            role="tab"
            id={feedTabId(idBase, sort)}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(sort)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${
              selected
                ? "border-emerald-400 text-white"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            {FEED_SORT_LABELS[sort]}
          </button>
        );
      })}
    </div>
  );
}
