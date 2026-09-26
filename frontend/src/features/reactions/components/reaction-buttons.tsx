"use client";

import { ROUTES } from "@/constants/routes";
import type { ReactionType } from "@/types/reaction";
import Link from "next/link";
import { useState } from "react";

export type ReactionButtonsMode = "interactive" | "signed-out" | "read-only";

// md: feed cards. lg: the post detail pill (larger in Post Details.png).
// sm: comment rows.
export type ReactionButtonsSize = "md" | "sm" | "lg";

type ReactionButtonsProps = {
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
  // The parent decides this — admin, logged-out, or auth still loading all
  // render as "read-only" or "signed-out" without this component ever
  // knowing why. Kept presentational: no axios, no services/api, no query
  // hook, enforced by lint.
  mode: ReactionButtonsMode;
  pending: boolean;
  errorMessage?: string | null;
  // Must be a stable reference in the parent (e.g. a mutation's own
  // `mutate`, or a useCallback), not a new arrow function every render.
  onToggle: (type: ReactionType) => void;
  size?: ReactionButtonsSize;
};

export function ThumbUpIcon({ px }: { px: number }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function ThumbDownIcon({ px }: { px: number }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

const sizeClasses: Record<ReactionButtonsSize, string> = {
  md: "gap-1.5 px-3 py-1.5 text-sm",
  sm: "gap-1 px-2 py-1 text-xs",
  lg: "gap-1.5 px-4 py-2 text-sm",
};

// The comment rows in the mockup carry smaller thumbs than the feed and
// detail pills, so the icon follows the size too.
const iconPx: Record<ReactionButtonsSize, number> = { md: 16, sm: 14, lg: 16 };

// rounded-full and semibold counts: the selected state in Feed.png and
// Post Details.png is a fully rounded pill with a bold count.
function reactionButtonClass(selected: boolean, size: ReactionButtonsSize) {
  return [
    "inline-flex items-center rounded-full font-semibold transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40",
    sizeClasses[size],
    selected
      ? "bg-emerald-400/10 text-emerald-400"
      : "text-neutral-400 hover:text-white",
  ].join(" ");
}

// Like/dislike controls for a post or a comment. Presentational only — it
// never decides why it's in read-only or signed-out mode; usePostReaction /
// useCommentReaction and whatever renders around them own auth, the
// mutation, and the cache.
export function ReactionButtons({
  likeCount,
  dislikeCount,
  myReaction,
  mode,
  pending,
  errorMessage,
  onToggle,
  size = "md",
}: ReactionButtonsProps) {
  const [showSignInHint, setShowSignInHint] = useState(false);

  function handleClick(type: ReactionType) {
    if (mode === "signed-out") {
      setShowSignInHint(true);
      return;
    }
    if (pending) return;
    onToggle(type);
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        {mode === "read-only" ? (
          <>
            <span
              className={`inline-flex items-center font-semibold text-neutral-400 ${sizeClasses[size]}`}
            >
              <ThumbUpIcon px={iconPx[size]} />
              <span>{likeCount}</span>
              <span className="sr-only"> likes</span>
            </span>
            <span
              className={`inline-flex items-center font-semibold text-neutral-400 ${sizeClasses[size]}`}
            >
              <ThumbDownIcon px={iconPx[size]} />
              <span>{dislikeCount}</span>
              <span className="sr-only"> dislikes</span>
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-pressed={myReaction === "like"}
              aria-label={`Like, ${likeCount}`}
              aria-disabled={pending ? "true" : undefined}
              onClick={() => handleClick("like")}
              className={reactionButtonClass(myReaction === "like", size)}
            >
              <ThumbUpIcon px={iconPx[size]} />
              <span>{likeCount}</span>
            </button>
            <button
              type="button"
              aria-pressed={myReaction === "dislike"}
              aria-label={`Dislike, ${dislikeCount}`}
              aria-disabled={pending ? "true" : undefined}
              onClick={() => handleClick("dislike")}
              className={reactionButtonClass(myReaction === "dislike", size)}
            >
              <ThumbDownIcon px={iconPx[size]} />
              <span>{dislikeCount}</span>
            </button>
          </>
        )}
      </div>

      {/* One always-present live region for both messages, so a screen reader
          announces the sign-in hint when it appears (a region that is mounted
          together with its text is often not announced) and the error after a
          rollback. The margin only applies when there is something to show,
          so an empty region adds no space under the buttons. */}
      <div
        role="status"
        className={`text-xs text-red-300 ${
          errorMessage || (mode === "signed-out" && showSignInHint)
            ? "mt-1"
            : ""
        }`}
      >
        {mode === "signed-out" && showSignInHint ? (
          <span className="text-neutral-400">
            <Link
              href={ROUTES.LOGIN}
              className="font-medium text-emerald-400 hover:underline"
            >
              Sign in
            </Link>{" "}
            to react.
          </span>
        ) : (
          (errorMessage ?? "")
        )}
      </div>
    </div>
  );
}
