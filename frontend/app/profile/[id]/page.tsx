"use client";

import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import type { Profile } from "@/lib/types/profile";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch(`/profile/${id}`);
        if (!cancelled) setProfile(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load profile.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const isOwnProfile = !!user && !!profile && user.id === profile.id;

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
                    <p className="text-sm text-muted">{profile.email}</p>
                  </div>
                  {profile.role === "admin" && (
                    <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                      Admin
                    </span>
                  )}
                </div>

                {isOwnProfile && (
                  <Link
                    href="/profile/edit"
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                  >
                    Edit profile
                  </Link>
                )}
              </div>

              <div className="flex flex-col gap-6 p-5 sm:p-6">
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
                    Experience
                  </h3>
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
