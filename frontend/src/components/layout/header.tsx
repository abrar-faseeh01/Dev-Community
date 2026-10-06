"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { HeaderSearch } from "./header-search";
import { UserMenu } from "./user-menu";

export function Header() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  // The feed and every post page (/posts, /posts/<id>, /posts/create, ...).
  const onFeed =
    pathname === ROUTES.POSTS || pathname.startsWith(`${ROUTES.POSTS}/`);

  // Only a regular member can create a post — admins moderate but don't
  // author (the API rejects an admin's POST /posts with a 403), so the entry
  // point is hidden for them and for anonymous visitors. Nothing shows while
  // the session is still loading, so it can't flash in and out.
  const canCreate = !loading && user?.role === "user";

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link
          href={ROUTES.HOME}
          className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-sm font-bold text-neutral-950">
            &lt;/&gt;
          </span>
          <span className="hidden sm:inline">Dev Community</span>
          <span className="sm:hidden">Dev</span>
        </Link>

        {/* min-w-0 so the input can actually shrink instead of forcing the
            header to overflow on a narrow screen. HeaderSearch reads the
            URL's search params, which needs a Suspense boundary for
            `next build`; it renders nothing itself for a signed-out or
            still-loading visitor. */}
        <div className="min-w-0 flex-1">
          <Suspense fallback={null}>
            <HeaderSearch />
          </Suspense>
        </div>

        <nav className="flex shrink-0 items-center gap-2 text-sm">
          {/* Posts are public, so this shows for everyone — including while
              the session is still loading and for logged-out visitors. */}
          <Link
            href={ROUTES.POSTS}
            aria-current={onFeed ? "page" : undefined}
            className={`rounded-lg px-3 py-2 font-medium transition-colors hover:bg-neutral-900 ${
              onFeed ? "text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            Feed
          </Link>

          {canCreate && (
            <Link
              href={ROUTES.POSTS_CREATE}
              className="hidden rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 sm:block"
            >
              Create Post
            </Link>
          )}

          {loading ? null : user ? (
            <>
              <NotificationBell userId={user.id} />
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Link
                href={ROUTES.LOGIN}
                className="rounded-lg px-3 py-2 font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href={ROUTES.SIGNUP}
                className="rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-neutral-950 transition-colors hover:bg-emerald-300"
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
