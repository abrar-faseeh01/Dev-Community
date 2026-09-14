"use client";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
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

function formatRelativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function Header() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(
    null,
  );
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
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
      if (e.key === "Escape") setNotifOpen(false);
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
          {loading ? null : user ? (
            <>
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={notifOpen}
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

                <div
                  role="menu"
                  className={`absolute right-0 top-[calc(100%+0.5rem)] w-80 origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-lg transition-all duration-150 ease-out ${
                    notifOpen
                      ? "pointer-events-auto scale-100 opacity-100"
                      : "pointer-events-none scale-95 opacity-0"
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
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {initial}
                </button>

                <div
                  role="menu"
                  className={`absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-lg transition-all duration-150 ease-out ${
                    menuOpen
                      ? "pointer-events-auto scale-100 opacity-100"
                      : "pointer-events-none scale-95 opacity-0"
                  }`}
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {user.fullName || user.email}
                    </p>
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
                      <Link
                        href={`/profile/${user.id}`}
                        onClick={() => setMenuOpen(false)}
                        role="menuitem"
                        className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                      >
                        Profile
                      </Link>
                    )}

                    <Link
                      href="/posts/create"
                      onClick={() => setMenuOpen(false)}
                      role="menuitem"
                      className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                    >
                      Create post
                    </Link>

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
