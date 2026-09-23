"use client";

import { useDismissible } from "@/hooks/use-dismissible";
import { formatRelativeTime } from "@/lib/utils/format-time";
import { useRef, useState } from "react";
import { useMarkNotificationRead } from "../mutations/notification-mutations";
import {
  useNotifications,
  useUnreadCount,
} from "../queries/notification-queries";
import type { NotificationItem } from "../types/notification";

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useDismissible({
    open,
    onDismiss: () => setOpen(false),
    containerRef,
    triggerRef: buttonRef,
  });

  const unreadCount = useUnreadCount(userId).data ?? 0;
  const list = useNotifications(userId, { enabled: open });
  const notifications = list.data ?? null;
  // Every open shows "Loading…" while the list refreshes, as it always has.
  const notifLoading = list.isFetching;
  const notifError = list.isError
    ? list.error instanceof Error
      ? list.error.message
      : "Failed to load notifications."
    : "";

  const markRead = useMarkNotificationRead(userId);
  function handleNotificationClick(notification: NotificationItem) {
    if (notification.read) return;
    markRead.mutate(notification._id);
  }

  return (
    // `sm:relative`, not `relative`: below the sm breakpoint the
    // notifications panel anchors to the header instead of to the bell (see
    // the panel's classes below).
    <div className="sm:relative" ref={containerRef}>
      {/* A disclosure, not a menu: the button reveals a panel of content (a
          heading and a list of notifications). There are no menu items in
          it, so role="menu"/aria-haspopup="menu" was wrong. It isn't a
          dialog either — focus doesn't move into the panel on open, which
          role="dialog" would imply. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* `invisible` (visibility:hidden) while closed, not just faded out:
          opacity/pointer-events leave the panel in the tab order and the
          accessibility tree, so keyboard and screen-reader users met
          invisible content. Visibility is animatable here (transition-all),
          so the fade-out still plays before it flips to hidden.

          Position: from the sm breakpoint up it hangs off the bell (right-0,
          20rem wide). Below it, the bell isn't at the right edge of the
          header (the avatar sits beside it), so a 20rem panel right-aligned
          to the bell ran off the left of the screen — 60px at 320px wide.
          There the wrapper isn't `relative`, so the panel anchors to the
          (sticky) header instead: 0.5rem in from its right edge, and no wider
          than the viewport minus a 0.5rem margin either side. */}
      <div
        id="notifications-panel"
        className={`absolute right-2 top-[calc(100%+0.5rem)] w-[min(20rem,calc(100vw-1rem))] origin-top-right overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-lg transition-all duration-150 ease-out sm:right-0 sm:w-80 ${
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
        }`}
      >
        <div className="border-b border-neutral-800 px-4 py-3">
          <p className="text-sm font-semibold text-white">Notifications</p>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifLoading && (
            <p className="p-4 text-sm text-neutral-400">Loading…</p>
          )}

          {!notifLoading && notifError && (
            <p
              role="alert"
              className="m-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300"
            >
              {notifError}
            </p>
          )}

          {!notifLoading &&
            !notifError &&
            notifications &&
            notifications.length === 0 && (
              <p className="p-4 text-sm text-neutral-400">
                No notifications yet.
              </p>
            )}

          {!notifLoading &&
            !notifError &&
            notifications &&
            notifications.length > 0 && (
              <ul className="flex flex-col">
                {notifications.map((n) => (
                  <li key={n._id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`flex w-full flex-col items-start gap-1 border-b border-neutral-800 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-neutral-800 ${
                        n.read ? "" : "bg-emerald-400/5"
                      }`}
                    >
                      <span className="flex w-full items-start gap-2">
                        {!n.read && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        )}
                        <span
                          className={`text-sm ${n.read ? "text-neutral-400" : "font-medium text-white"}`}
                        >
                          {n.message}
                        </span>
                      </span>
                      <span className="pl-3.5 text-xs text-neutral-400">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
}
