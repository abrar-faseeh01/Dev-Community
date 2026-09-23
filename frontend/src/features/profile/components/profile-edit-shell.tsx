"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useProfile } from "@/features/profile/queries/profile-queries";
import type { Profile } from "@/features/profile/types/profile";
import Link from "next/link";
import { useState, type ReactNode } from "react";

type ProfileEditShellProps = {
  targetId: string;
  title: string;
  // The Profile edit page drops this shell's default "Signed in as / View
  // profile" row in favor of the "Profile" eyebrow link above the title
  // doubling as its way out, and its own Save changes button rendered below
  // the box via footerSlot (see children below). The Experience edit page
  // doesn't pass this — it keeps the row exactly as before.
  hideStatusBar?: boolean;
  // `footerSlot` is the DOM node of the empty div rendered just under the
  // box, outside it — a portal target so a page's own action button can
  // sit below the card without this shell needing to know anything about
  // that button's logic. null until it mounts (i.e. before `profile` has
  // loaded), same as everything else gated on `profile` below.
  children: (context: {
    profile: Profile;
    isOwn: boolean;
    footerSlot: HTMLDivElement | null;
  }) => ReactNode;
};

// The frame both edit pages share: heading, who-may-edit check, loading and
// load-error states, and the "Signed in as / Editing <name>'s profile" bar.
// The page's own sections render inside it once the profile has loaded.
export function ProfileEditShell({
  targetId,
  title,
  hideStatusBar = false,
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

  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

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
    <main className="flex flex-1 justify-center bg-neutral-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          {hideStatusBar ? (
            // This page has no separate Cancel control — this link back to
            // the view page is it. Only shown here: the Experience edit page
            // still has its own "View profile" link in the status bar below.
            <Link
              href={ROUTES.profile(targetId)}
              className="mb-1 inline-block text-sm font-medium text-emerald-400 hover:underline"
            >
              Profile
            </Link>
          ) : (
            <p className="mb-1 text-sm font-medium text-emerald-400">Profile</p>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            This is what other developers see on your public profile.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {(authLoading || (authorized && loading)) && (
            <p className="p-6 text-sm text-neutral-400">Loading profile…</p>
          )}

          {unauthorized && (
            <div className="m-5 flex flex-col gap-3 sm:m-6">
              <p
                role="alert"
                className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300"
              >
                You can only edit your own profile.
              </p>
              {user && (
                <Link
                  href={ROUTES.profile(user.id)}
                  className="text-sm font-medium text-emerald-400 hover:underline"
                >
                  Go to your profile
                </Link>
              )}
            </div>
          )}

          {authorized && !loading && loadError && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300 sm:m-6"
            >
              {loadError}
            </p>
          )}

          {authorized && !loading && !loadError && profile && (
            <>
              {/* Both edit pages are entered as siblings from the view page,
                  not from each other, so the only way "out" links back to
                  the view page. */}
              {!hideStatusBar && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4 sm:px-6">
                  <p className="text-sm text-neutral-400">
                    {isOwn ? (
                      <>Signed in as {profile.fullName}</>
                    ) : (
                      <>
                        Editing {profile.fullName || profile.email}&rsquo;s
                        profile{" "}
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          Admin
                        </span>
                      </>
                    )}
                  </p>
                  <Link
                    href={ROUTES.profile(profile.id)}
                    className="text-sm font-medium text-emerald-400 hover:underline"
                  >
                    View profile
                  </Link>
                </div>
              )}

              {children({ profile, isOwn, footerSlot })}
            </>
          )}
        </div>

        {authorized && !loading && !loadError && profile && (
          <div ref={setFooterSlot} className="mt-6 flex justify-end" />
        )}
      </div>
    </main>
  );
}
