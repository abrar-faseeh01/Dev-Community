"use client";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRelativeTime } from "@/lib/format-time";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NotificationItem = {
  _id: string;
  message: string;
  read: boolean;
  createdAt: string;
};

// Polling over invalidating-on-navigation: this app has no websocket/push
// channel, and a user can easily sit on one page (e.g. editing a profile)
// long enough for a notification to arrive without ever navigating — route
// changes alone would miss that. 45s keeps the badge reasonably fresh
// without meaningfully denting the global rate limit (100 req/60s).
const UNREAD_POLL_INTERVAL_MS = 45_000;

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

export function Header() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  // The feed and every post page (/posts, /posts/<id>, /posts/create, ...).
  const onFeed = pathname === "/posts" || pathname.startsWith("/posts/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(
    null,
  );
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    // A closed panel is visibility:hidden, which drops focus from anything
    // inside it — so Escape hands focus back to the button that opened the
    // panel, the standard behavior for a menu, instead of leaving it lost.
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!notifOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setNotifOpen(false);
        notifButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [notifOpen]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchUnreadCount() {
      try {
        const res = await apiFetch("/notifications/unread-count");
        if (!cancelled) setUnreadCount(res.data);
      } catch {
        // Silent — a failed badge refresh isn't worth surfacing an error for.
      }
    }

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, UNREAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    if (!notifOpen) return;
    let cancelled = false;

    async function loadNotifications() {
      setNotifLoading(true);
      setNotifError("");
      try {
        const res = await apiFetch("/notifications");
        if (!cancelled) setNotifications(res.data);
      } catch (err) {
        if (!cancelled) {
          setNotifError(
            err instanceof Error ? err.message : "Failed to load notifications.",
          );
        }
      } finally {
        if (!cancelled) setNotifLoading(false);
      }
    }

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [notifOpen]);

  async function handleNotificationClick(notification: NotificationItem) {
    if (notification.read) return;
    try {
      await apiFetch(`/notifications/${notification._id}/read`, {
        method: "PATCH",
      });
      setNotifications(
        (prev) =>
          prev &&
          prev.map((n) =>
            n._id === notification._id ? { ...n, read: true } : n,
          ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // Leave it unread in the UI if the request failed — no silent lie.
    }
  }

  const isAdmin = user?.role === "admin";
  // Admins always show "A" — there is intentionally exactly one admin in
  // this project, so their initial doesn't need to be name-derived.
  const initial = isAdmin
    ? "A"
    : (user?.fullName?.trim()?.[0] || user?.email?.[0] || "?").toUpperCase();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
            &lt;/&gt;
          </span>
          <span className="hidden sm:inline">Dev Community</span>
          <span className="sm:hidden">Dev</span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {/* Posts are public, so this shows for everyone — including while
              the session is still loading and for logged-out visitors. */}
          <Link
            href="/posts"
            aria-current={onFeed ? "page" : undefined}
            className={`rounded-lg px-3 py-2 font-medium transition-colors hover:bg-background ${
              onFeed ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Feed
          </Link>

          {loading ? null : user ? (
            <>
              {/* `sm:relative`, not `relative`: below the sm breakpoint the
                  notifications panel anchors to the header instead of to the
                  bell (see the panel's classes below). */}
              <div className="sm:relative" ref={notifRef}>
                {/* A disclosure, not a menu: the button reveals a panel of
                    content (a heading and a list of notifications). There are
                    no menu items in it, so role="menu"/aria-haspopup="menu"
                    was wrong. It isn't a dialog either — focus doesn't move
                    into the panel on open, which role="dialog" would imply. */}
                <button
                  ref={notifButtonRef}
                  type="button"
                  onClick={() => setNotifOpen((open) => !open)}
                  aria-expanded={notifOpen}
                  aria-controls="notifications-panel"
                  aria-label="Notifications"
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <BellIcon />
                  {unreadCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* `invisible` (visibility:hidden) while closed, not just
                    faded out: opacity/pointer-events leave the panel in the
                    tab order and the accessibility tree, so keyboard and
                    screen-reader users met invisible content. Visibility is
                    animatable here (transition-all), so the fade-out still
                    plays before it flips to hidden.

                    Position: from the sm breakpoint up it hangs off the bell
                    (right-0, 20rem wide). Below it, the bell isn't at the
                    right edge of the header (the avatar sits beside it), so a
                    20rem panel right-aligned to the bell ran off the left of
                    the screen — 60px at 320px wide. There the wrapper isn't
                    `relative`, so the panel anchors to the (sticky) header
                    instead: 0.5rem in from its right edge, and no wider than
                    the viewport minus a 0.5rem margin either side. */}
                <div
                  id="notifications-panel"
                  className={`absolute right-2 top-[calc(100%+0.5rem)] w-[min(20rem,calc(100vw-1rem))] origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-lg transition-all duration-150 ease-out sm:right-0 sm:w-80 ${
                    notifOpen
                      ? "visible scale-100 opacity-100"
                      : "invisible scale-95 opacity-0"
                  }`}
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">
                      Notifications
                    </p>
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {notifLoading && (
                      <p className="p-4 text-sm text-muted">Loading…</p>
                    )}

                    {!notifLoading && notifError && (
                      <p
                        role="alert"
                        className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      >
                        {notifError}
                      </p>
                    )}

                    {!notifLoading &&
                      !notifError &&
                      notifications &&
                      notifications.length === 0 && (
                        <p className="p-4 text-sm text-muted">
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
                                className={`flex w-full flex-col items-start gap-1 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-background ${
                                  n.read ? "" : "bg-accent/5"
                                }`}
                              >
                                <span className="flex w-full items-start gap-2">
                                  {!n.read && (
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                                  )}
                                  <span
                                    className={`text-sm ${n.read ? "text-muted" : "font-medium text-foreground"}`}
                                  >
                                    {n.message}
                                  </span>
                                </span>
                                <span className="pl-3.5 text-xs text-muted">
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

              <div className="relative" ref={menuRef}>
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls="account-menu"
                  aria-label="Account menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {initial}
                </button>

                {/* This one really is a menu (role="menuitem" links), so its
                    role stays. Same closed-state fix as the notifications
                    panel above. */}
                <div
                  id="account-menu"
                  role="menu"
                  className={`absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-lg transition-all duration-150 ease-out ${
                    menuOpen
                      ? "visible scale-100 opacity-100"
                      : "invisible scale-95 opacity-0"
                  }`}
                >
                  <div className="border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {user.fullName || user.email}
                      </p>
                      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                        {isAdmin ? "Admin" : "User"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>

                  <div className="flex flex-col gap-0.5 p-1.5">
                    {isAdmin ? (
                      <>
                        <Link
                          href="/admin/users"
                          onClick={() => setMenuOpen(false)}
                          role="menuitem"
                          className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                        >
                          All users
                        </Link>
                        <Link
                          href="/admin/audit-log"
                          onClick={() => setMenuOpen(false)}
                          role="menuitem"
                          className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                        >
                          Audit log
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/profile/${user.id}`}
                          onClick={() => setMenuOpen(false)}
                          role="menuitem"
                          className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                        >
                          Profile
                        </Link>
                        <Link
                          href="/posts/create"
                          onClick={() => setMenuOpen(false)}
                          role="menuitem"
                          className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                        >
                          Create post
                        </Link>
                      </>
                    )}

                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      role="menuitem"
                      className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                    >
                      Settings
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                      role="menuitem"
                      className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
