"use client";

import { ROUTES } from "@/constants/routes";
import type { AuthUser } from "@/features/auth/types/user";
import { useLogout } from "@/features/auth/mutations/auth-mutations";
import { useDismissible } from "@/hooks/use-dismissible";
import Link from "next/link";
import { useRef, useState } from "react";

const menuItemClass =
  "rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background";

export function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useDismissible({
    open,
    onDismiss: () => setOpen(false),
    containerRef,
    triggerRef: buttonRef,
  });

  const logoutMutation = useLogout();

  const isAdmin = user.role === "admin";
  // Admins always show "A" — there is intentionally exactly one admin in
  // this project, so their initial doesn't need to be name-derived.
  const initial = isAdmin
    ? "A"
    : (user.fullName?.trim()?.[0] || user.email?.[0] || "?").toUpperCase();

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {initial}
      </button>

      {/* This one really is a menu (role="menuitem" links), so its role
          stays. Closed with `invisible`, not just faded, so a closed menu
          isn't in the tab order or the accessibility tree. */}
      <div
        id="account-menu"
        role="menu"
        className={`absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-lg transition-all duration-150 ease-out ${
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
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
                href={ROUTES.ADMIN_USERS}
                onClick={() => setOpen(false)}
                role="menuitem"
                className={menuItemClass}
              >
                All users
              </Link>
              <Link
                href={ROUTES.ADMIN_AUDIT_LOG}
                onClick={() => setOpen(false)}
                role="menuitem"
                className={menuItemClass}
              >
                Audit log
              </Link>
            </>
          ) : (
            <>
              <Link
                href={ROUTES.profile(user.id)}
                onClick={() => setOpen(false)}
                role="menuitem"
                className={menuItemClass}
              >
                Profile
              </Link>
              <Link
                href={ROUTES.POSTS_CREATE}
                onClick={() => setOpen(false)}
                role="menuitem"
                className={menuItemClass}
              >
                Create post
              </Link>
            </>
          )}

          <Link
            href={ROUTES.SETTINGS}
            onClick={() => setOpen(false)}
            role="menuitem"
            className={menuItemClass}
          >
            Settings
          </Link>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logoutMutation.mutate();
            }}
            role="menuitem"
            className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
