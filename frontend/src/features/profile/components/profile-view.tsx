"use client";

import { Avatar } from "@/components/common/avatar";
import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { MyPosts } from "@/features/posts/components/my-posts";
import { useProfile } from "@/features/profile/queries/profile-queries";
import Link from "next/link";
import { useState } from "react";
import { ProfileExperienceSection } from "./profile-experience-section";
import { ProfilePortfolioSection } from "./profile-portfolio-section";

type ProfileTab = "posts" | "portfolio" | "skills" | "experience";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "posts", label: "Posts" },
  { id: "portfolio", label: "Portfolio" },
  { id: "skills", label: "Skills" },
  { id: "experience", label: "Experience" },
];

const tabClass = (active: boolean) =>
  `-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 rounded-t ${
    active
      ? "border-emerald-400 text-white"
      : "border-transparent text-neutral-400 hover:text-white"
  }`;

export function ProfileView({ id }: { id: string }) {
  const { user } = useAuth();
  // Defaults to Posts — the tab most likely to have something to show. No
  // count on any label: showing one would mean claiming a number we don't
  // compute for any of the four.
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");

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
  // Governs both the "Edit profile" button and the Experience tab's "Edit
  // experience" button — the backend's owner-or-admin check on every write
  // route is the real security boundary, so an admin viewing someone else's
  // profile should see the same edit entry points an owner does, not have to
  // know the URL to type in by hand.
  const canEdit = isOwn || isAdmin;

  return (
    <main className="flex flex-1 justify-center bg-neutral-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-emerald-400">Profile</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Developer profile
          </h1>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {loading && (
            <p className="p-6 text-sm text-neutral-400">Loading profile…</p>
          )}

          {!loading && error && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300 sm:m-6"
            >
              {error}
            </p>
          )}

          {!loading && !error && profile && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <Avatar name={profile.fullName} size="md" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">
                        {profile.fullName}
                      </h2>
                      {profile.role === "admin" && (
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-400">
                      {profile.headline || "No headline set."}
                    </p>
                    <p className="text-sm text-neutral-400">{profile.email}</p>
                  </div>
                </div>

                {canEdit && (
                  <Link
                    href={ROUTES.profileEdit(profile.id)}
                    className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300"
                  >
                    Edit profile
                  </Link>
                )}
              </div>

              <div className="flex flex-col gap-6 p-5 sm:p-6">
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-white">
                    Bio
                  </h3>
                  <p className="text-sm text-neutral-200">
                    {profile.bio || (
                      <span className="text-neutral-400">No bio yet.</span>
                    )}
                  </p>
                </section>

                <section>
                  <div role="tablist" aria-label="Profile content" className="flex gap-6 border-b border-neutral-800">
                    {TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`profile-tab-${tab.id}`}
                        aria-selected={activeTab === tab.id}
                        aria-controls={`profile-panel-${tab.id}`}
                        onClick={() => setActiveTab(tab.id)}
                        className={tabClass(activeTab === tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div
                    id={`profile-panel-${activeTab}`}
                    role="tabpanel"
                    aria-labelledby={`profile-tab-${activeTab}`}
                    className="pt-5"
                  >
                    {activeTab === "posts" && (
                      // Same list, hook, and Edit/Delete gating as
                      // /posts/mine (getPostActor decides who sees the
                      // controls) — just pointed at this profile's author id
                      // instead of defaulting to the viewer's own.
                      <MyPosts user={user} authorId={profile.id} />
                    )}
                    {activeTab === "portfolio" && (
                      <ProfilePortfolioSection
                        projects={profile.portfolioProjects}
                        editHref={
                          canEdit
                            ? ROUTES.profileEditPortfolio(profile.id)
                            : undefined
                        }
                      />
                    )}
                    {activeTab === "skills" && (
                      <section>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-white">
                            Skills
                          </h3>
                          {canEdit && (
                            <Link
                              href={ROUTES.profileEditSkills(profile.id)}
                              className="text-sm font-medium text-emerald-400 hover:underline"
                            >
                              Edit
                            </Link>
                          )}
                        </div>
                        {profile.skills.length === 0 ? (
                          <p className="text-sm text-neutral-400">No skills listed yet.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {profile.skills.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs font-medium text-white"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                    {activeTab === "experience" && (
                      <ProfileExperienceSection
                        profileId={profile.id}
                        experiences={profile.experiences}
                        canEdit={canEdit}
                      />
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
