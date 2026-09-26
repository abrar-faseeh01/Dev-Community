"use client";

import { Avatar } from "@/components/common/avatar";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { Reactor, ReactorTab } from "../types/reactor";
import { ThumbDownIcon, ThumbUpIcon } from "./reaction-buttons";

type ReactorsModalProps = {
  open: boolean;
  onClose: () => void;
  tab: ReactorTab;
  onTabChange: (tab: ReactorTab) => void;
  // The target's totals, for the tab labels. Not the length of `reactors`:
  // that is capped by the server, and only holds the selected tab.
  likeCount: number;
  dislikeCount: number;
  // undefined until the selected tab's list has arrived.
  reactors: Reactor[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  // The signed-in viewer, so their own row can say "You". null when signed out.
  viewerId: string | null;
};

const TABS: { id: ReactorTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "like", label: "Like" },
  { id: "dislike", label: "Dislike" },
];

const EMPTY_TEXT: Record<ReactorTab, string> = {
  all: "No reactions yet.",
  like: "No likes yet.",
  dislike: "No dislikes yet.",
};

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [tabindex]:not([tabindex="-1"])';

// The "who reacted" overlay: a tab per filter (All / Like / Dislike) over one
// list of people. Presentational — the parent decides when it is open and owns
// the fetch, so this never calls the API. Plain React state and conditional
// rendering, the same as ConfirmDialog, with the same keyboard behaviour:
// Escape or a click outside closes it, Tab stays inside, focus goes in when it
// opens and back to what opened it when it closes.
export function ReactorsModal({
  open,
  onClose,
  tab,
  onTabChange,
  likeCount,
  dislikeCount,
  reactors,
  isPending,
  isError,
  onRetry,
  viewerId,
}: ReactorsModalProps) {
  const ids = useId();
  const titleId = `${ids}-title`;
  const panelId = `${ids}-panel`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectedTabRef = useRef<HTMLButtonElement>(null);

  // Who had focus before the dialog opened; given it back on close, if it is
  // still on the page.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  // Focus goes to the selected tab when the dialog opens.
  useEffect(() => {
    if (open) selectedTabRef.current?.focus();
  }, [open]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  const totals: Record<ReactorTab, number> = {
    all: likeCount + dislikeCount,
    like: likeCount,
    dislike: dislikeCount,
  };

  // Left and Right move between the tabs, as a tablist is expected to.
  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const step = e.key === "ArrowRight" ? 1 : -1;
    onTabChange(TABS[(index + step + TABS.length) % TABS.length].id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-neutral-800 bg-neutral-900 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 id={titleId} className="text-base font-semibold text-white">
            Reactions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
          >
            <span aria-hidden="true" className="block h-4 w-4 text-center leading-4">
              ×
            </span>
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Filter by reaction"
          className="mt-3 flex gap-1 border-b border-neutral-800 px-3"
        >
          {TABS.map((t) => {
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                ref={selected ? selectedTabRef : undefined}
                type="button"
                role="tab"
                id={`${ids}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(t.id)}
                onKeyDown={handleTabKeyDown}
                className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${
                  selected
                    ? "border-emerald-400 text-white"
                    : "border-transparent text-neutral-400 hover:text-white"
                }`}
              >
                {t.label} {totals[t.id]}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={`${ids}-tab-${tab}`}
          className="min-h-24 overflow-y-auto px-5 py-3"
        >
          {isError ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-red-900/50 bg-red-950/40 p-3"
            >
              <p className="text-sm text-red-300">
                Couldn&rsquo;t load who reacted.
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 rounded-lg border border-red-900/50 bg-neutral-900 px-3 py-1 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/40 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                Retry
              </button>
            </div>
          ) : isPending || !reactors ? (
            <div role="status" aria-busy="true" className="flex flex-col gap-3">
              <span className="sr-only">Loading reactions…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-neutral-800" />
                  <div className="h-3 w-32 rounded bg-neutral-800" />
                </div>
              ))}
            </div>
          ) : reactors.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">
              {EMPTY_TEXT[tab]}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {reactors.map((reactor, i) => (
                  <li
                    key={reactor.user.id ?? `deleted-${i}`}
                    className="flex items-center gap-3"
                  >
                    <span className="relative shrink-0">
                      <Avatar name={reactor.user.fullName} size="sm" />
                      {/* Which reaction it was, on the All tab where the rows
                          are mixed (the other tabs are already one type). */}
                      {tab === "all" && (
                        <span
                          aria-hidden="true"
                          className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-neutral-900 ${
                            reactor.type === "like"
                              ? "bg-emerald-400 text-neutral-950"
                              : "bg-neutral-600 text-white"
                          }`}
                        >
                          {reactor.type === "like" ? (
                            <ThumbUpIcon px={9} />
                          ) : (
                            <ThumbDownIcon px={9} />
                          )}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">
                        {reactor.user.fullName}
                        {viewerId !== null && reactor.user.id === viewerId && (
                          <span className="ml-1.5 text-xs font-normal text-neutral-400">
                            You
                          </span>
                        )}
                      </span>
                      {tab === "all" && (
                        <span className="sr-only">
                          {reactor.type === "like" ? "Liked" : "Disliked"}
                        </span>
                      )}
                      {reactor.user.headline && (
                        <span className="block truncate text-xs text-neutral-400">
                          {reactor.user.headline}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {reactors.length < totals[tab] && (
                <p className="mt-3 border-t border-neutral-800 pt-3 text-center text-xs text-neutral-400">
                  Showing the {reactors.length} most recent of {totals[tab]}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
