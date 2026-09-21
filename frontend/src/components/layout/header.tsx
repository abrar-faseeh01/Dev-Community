"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

export function Header() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  // The feed and every post page (/posts, /posts/<id>, /posts/create, ...).
  const onFeed =
    pathname === ROUTES.POSTS || pathname.startsWith(`${ROUTES.POSTS}/`);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={ROUTES.HOME}
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
            href={ROUTES.POSTS}
            aria-current={onFeed ? "page" : undefined}
            className={`rounded-lg px-3 py-2 font-medium transition-colors hover:bg-background ${
              onFeed ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Feed
          </Link>

          {loading ? null : user ? (
            <>
              <NotificationBell userId={user.id} />
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Link
                href={ROUTES.LOGIN}
                className="rounded-lg px-3 py-2 font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                href={ROUTES.SIGNUP}
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
