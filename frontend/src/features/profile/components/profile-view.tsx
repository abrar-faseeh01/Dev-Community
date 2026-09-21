"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useProfile } from "@/features/profile/queries/profile-queries";
import Link from "next/link";
import { ProfileExperienceSection } from "./profile-experience-section";
import { ProfilePortfolioSection } from "./profile-portfolio-section";

export function ProfileView({ id }: { id: string }) {
  const { user } = useAuth();

  const profileQuery = useProfile(id);
  const profile = profileQuery.data ?? null;
  const loading = profileQuery.isPending;
  const error = profileQuery.isError
    ? profileQuery.error instanceof Error
      ? profileQuery.error.message
      : "Failed to load profile."
    : "";

  const isOwn = !!user && !!profile && user.id === profile.id;
  const isAdmin = user?.role === "admin";
  // Governs both the "Edit profile" and "Edit experience" buttons below —
  // the backend's owner-or-admin check on every write route is the real
  // security boundary, so an admin viewing someone else's profile should
  // see the same edit entry points an owner does, not have to know the
  // URL to type in by hand.
  const canEdit = isOwn || isAdmin;

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Profile</p>
          <h1 className="text-2xl font-bold tracking-tight">
            Developer profile
          </h1>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {loading && (
            <p className="p-6 text-sm text-muted">Loading profile…</p>
          )}

          {!loading && error && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 sm:m-6"
            >
              {error}
            </p>
          )}

          {!loading && !error && profile && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                <div className="flex items-center gap-2.5">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {profile.fullName}
                    </h2>
                    <p className="text-sm text-muted">
                      {profile.headline || "No headline set."}
                    </p>
                    <p className="text-sm text-muted">{profile.email}</p>
                  </div>
                  {profile.role === "admin" && (
                    <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                      Admin
                    </span>
                  )}
                </div>

                {canEdit && (
                  <Link
                    href={ROUTES.profileEdit(profile.id)}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                  >
                    Edit profile
                  </Link>
                )}
              </div>

              <div className="flex flex-col gap-6 p-5 sm:p-6">
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Bio
                  </h3>
                  <p className="text-sm text-foreground">
                    {profile.bio || (
                      <span className="text-muted">No bio yet.</span>
                    )}
                  </p>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Skills
                  </h3>
                  {profile.skills.length === 0 ? (
                    <p className="text-sm text-muted">No skills listed yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </section>

                <ProfilePortfolioSection
                  projects={profile.portfolioProjects}
                />

                <ProfileExperienceSection
                  profileId={profile.id}
                  experiences={profile.experiences}
                  canEdit={canEdit}
                />

                {/* Only on your own profile, and only for accounts that can
                    write posts. Managing them (edit / delete) happens on the
                    page this opens. */}
                {isOwn && user?.role === "user" && (
                  <section>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Posts made by you
                      </h3>
                      <Link
                        href={ROUTES.POSTS_MINE}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                      >
                        View your posts
                      </Link>
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
