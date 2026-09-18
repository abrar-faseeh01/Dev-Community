"use client";

import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import type { Profile } from "@/lib/types/profile";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

function formatProjectDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  // Same query key as the edit page (frontend/app/profile/edit/[id]/page.tsx)
  // on purpose: a save there calls queryClient.setQueryData on this exact
  // key, so navigating here afterward reads the just-saved data straight
  // from cache — no stale flash, no extra round trip.
  const profileQuery = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => (await apiFetch<Profile>(`/profile/${id}`)).data,
  });
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
                    href={`/profile/edit/${profile.id}`}
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

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Portfolio projects
                  </h3>
                  {profile.portfolioProjects.length === 0 ? (
                    <p className="text-sm text-muted">
                      No portfolio projects yet.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {profile.portfolioProjects.map((p) => (
                        <div
                          key={p._id ?? p.title}
                          className="rounded-lg border border-border bg-background p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {p.title}
                            </p>
                            <p className="text-xs text-muted">
                              {formatProjectDate(p.startDate)} –{" "}
                              {p.isCurrent
                                ? "Present"
                                : p.endDate
                                  ? formatProjectDate(p.endDate)
                                  : ""}
                            </p>
                          </div>
                          {p.description && (
                            <p className="mt-2 text-sm text-foreground">
                              {p.description}
                            </p>
                          )}
                          {p.technologies.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {p.technologies.map((tech) => (
                                <span
                                  key={tech}
                                  className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground"
                                >
                                  {tech}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-3 flex gap-4 text-sm font-medium">
                            <a
                              href={p.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline"
                            >
                              Live demo
                            </a>
                            <a
                              href={p.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline"
                            >
                              GitHub
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Experience
                    </h3>
                    {canEdit && (
                      <Link
                        href={`/profile/edit/${profile.id}/experience`}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                      >
                        Edit experience
                      </Link>
                    )}
                  </div>
                  {profile.experiences.length === 0 ? (
                    <p className="text-sm text-muted">
                      No experience listed yet.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {profile.experiences.map((exp) => (
                        <div
                          key={exp._id ?? `${exp.title}-${exp.company}`}
                          className="rounded-lg border border-border bg-background p-4"
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {exp.title}
                          </p>
                          <p className="text-sm text-muted">
                            {exp.company} · {exp.from} – {exp.to || "Present"}
                          </p>
                          {exp.description && (
                            <p className="mt-2 text-sm text-foreground">
                              {exp.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
