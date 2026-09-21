"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useProfile } from "@/features/profile/queries/profile-queries";
import type { Profile } from "@/features/profile/types/profile";
import Link from "next/link";
import type { ReactNode } from "react";

type ProfileEditShellProps = {
  targetId: string;
  title: string;
  children: (context: { profile: Profile; isOwn: boolean }) => ReactNode;
};

// The frame both edit pages share: heading, who-may-edit check, loading and
// load-error states, and the "Signed in as / Editing <name>'s profile" bar.
// The page's own sections render inside it once the profile has loaded.
export function ProfileEditShell({
  targetId,
  title,
  children,
}: ProfileEditShellProps) {
  const { user, loading: authLoading } = useAuth();

  const isOwn = !!user && user.id === targetId;
  const isAdmin = user?.role === "admin";
  // The backend's owner-or-admin check on every write route is the real
  // security boundary; this is purely so a disallowed visitor sees a clear
  // message instead of a page that silently fails every save.
  const authorized = !authLoading && (isOwn || isAdmin);
  const unauthorized = !authLoading && !!user && !isOwn && !isAdmin;

  const profileQuery = useProfile(targetId, { enabled: authorized });
  const profile = profileQuery.data ?? null;
  const loading = authorized && profileQuery.isPending;
  const loadError =
    authorized && profileQuery.isError
      ? profileQuery.error instanceof Error
        ? profileQuery.error.message
        : "Failed to load profile."
      : "";

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Profile</p>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {(authLoading || (authorized && loading)) && (
            <p className="p-6 text-sm text-muted">Loading profile…</p>
          )}

          {unauthorized && (
            <div className="m-5 flex flex-col gap-3 sm:m-6">
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                You can only edit your own profile.
              </p>
              {user && (
                <Link
                  href={ROUTES.profile(user.id)}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Go to your profile
                </Link>
              )}
            </div>
          )}

          {authorized && !loading && loadError && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 sm:m-6"
            >
              {loadError}
            </p>
          )}

          {authorized && !loading && !loadError && profile && (
            <>
              {/* Both edit pages are entered as siblings from the view page,
                  not from each other, so the only way "out" links back to
                  the view page. */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                <p className="text-sm text-muted">
                  {isOwn ? (
                    <>Signed in as {profile.fullName}</>
                  ) : (
                    <>
                      Editing {profile.fullName || profile.email}&rsquo;s
                      profile{" "}
                      <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        Admin
                      </span>
                    </>
                  )}
                </p>
                <Link
                  href={ROUTES.profile(profile.id)}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  View profile
                </Link>
              </div>

              {children({ profile, isOwn })}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
