"use client";

import { PortfolioProjectField } from "@/components/profile/portfolio-project-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fullNameSchema,
  profileDetailsSchema,
  type FullNameFormValues,
  type ProfileDetailsFormValues,
} from "@/lib/schemas/profile-details";
import type { Profile } from "@/lib/types/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FormProvider, useFieldArray, useForm, type Path } from "react-hook-form";

const EMPTY_PORTFOLIO_PROJECT: ProfileDetailsFormValues["portfolioProjects"][number] =
  {
    title: "",
    description: "",
    liveUrl: "",
    githubUrl: "",
    technologies: [],
    startDate: "",
    endDate: "",
    isCurrent: false,
  };

// Backend Date -> JSON gives a full ISO datetime ("2023-01-15T00:00:00.000Z");
// <input type="date"> needs just the date part.
function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";
const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";
const errorTextClass = "text-sm text-red-600";

// Every section below is its own independent RHF+Zod form + its own
// useMutation, saving immediately via the same granular endpoint it always
// used — only the validation/input layer changed, not when or how
// anything persists. This reads a mutation's error the same way every
// existing `catch (err) { err instanceof Error ? err.message : fallback }`
// block in this file already did.
function mutationError(
  mutation: { isError: boolean; error: unknown },
  fallback: string,
): string {
  if (!mutation.isError) return "";
  return mutation.error instanceof Error ? mutation.error.message : fallback;
}

export default function EditProfilePage() {
  const { id: targetId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const isOwn = !!user && user.id === targetId;
  const isAdmin = user?.role === "admin";
  // The backend's owner-or-admin check on every write route is the real
  // security boundary; this is purely so a disallowed visitor sees a clear
  // message instead of a page that silently fails every save.
  const authorized = !authLoading && (isOwn || isAdmin);
  const unauthorized = !authLoading && !!user && !isOwn && !isAdmin;

  // --- shared profile data: every section below reads its initial values
  // from this one cache entry, and every section's mutation writes the
  // server's fresh response back into it on success, so a save in one
  // section is reflected everywhere else without a full page reload. ---
  const profileQuery = useQuery({
    queryKey: ["profile", targetId],
    queryFn: async () =>
      (await apiFetch<Profile>(`/profile/${targetId}`)).data,
    enabled: authorized,
  });
  const profile = profileQuery.data ?? null;
  const loading = authorized && profileQuery.isPending;
  const loadError =
    authorized && profileQuery.isError
      ? profileQuery.error instanceof Error
        ? profileQuery.error.message
        : "Failed to load profile."
      : "";

  function applyProfile(next: Profile) {
    queryClient.setQueryData(["profile", targetId], next);
  }

  // --- headline / bio / skills / portfolio projects — one combined form
  // with one Save button, sending only the sections that actually
  // changed. headline/bio/portfolioProjects never had a pre-existing
  // "one action = one button" expectation to preserve; skills used to
  // have its own standalone save button but is architecturally the same
  // kind of thing (a simple, full-replace value with no per-item
  // identity), so it now shares this form/mutation too. ---
  const detailsForm = useForm<ProfileDetailsFormValues>({
    resolver: zodResolver(profileDetailsSchema),
    defaultValues: {
      headline: "",
      bio: "",
      skills: [],
      portfolioProjects: [],
      reason: "",
    },
  });
  useEffect(() => {
    if (!profile) return;
    detailsForm.reset({
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      skills: profile.skills,
      portfolioProjects: (profile.portfolioProjects ?? []).map((p) => ({
        _id: p._id,
        title: p.title,
        description: p.description ?? "",
        liveUrl: p.liveUrl,
        githubUrl: p.githubUrl,
        technologies: p.technologies,
        startDate: toDateInputValue(p.startDate),
        endDate: p.endDate ? toDateInputValue(p.endDate) : "",
        isCurrent: p.isCurrent,
      })),
      reason: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const projectFields = useFieldArray({
    control: detailsForm.control,
    name: "portfolioProjects",
  });
  const [pendingDeleteProjectIndex, setPendingDeleteProjectIndex] = useState<
    number | null
  >(null);

  const detailsMutation = useMutation({
    // Only the dirty sub-sections are sent, as separate PATCH calls —
    // sending all three on every save would fire near-identical
    // admin-override audit entries even when only one field changed.
    // Sequential (not Promise.all): if an earlier request fails, later
    // ones are simply never attempted, rather than leaving an ambiguous
    // partial-success state where some requests succeeded and others
    // failed concurrently.
    mutationFn: async (values: ProfileDetailsFormValues) => {
      const reason = values.reason.trim() || undefined;
      const dirty = detailsForm.formState.dirtyFields;
      let latest: Profile | null = null;

      if (dirty.headline) {
        latest = (
          await apiFetch<Profile>(`/profile/${targetId}/headline`, {
            method: "PATCH",
            body: JSON.stringify({ headline: values.headline, reason }),
          })
        ).data;
      }
      if (dirty.bio) {
        latest = (
          await apiFetch<Profile>(`/profile/${targetId}/bio`, {
            method: "PATCH",
            body: JSON.stringify({ bio: values.bio, reason }),
          })
        ).data;
      }
      if (dirty.skills) {
        latest = (
          await apiFetch<Profile>(`/profile/${targetId}/skills`, {
            method: "PATCH",
            body: JSON.stringify({ skills: values.skills, reason }),
          })
        ).data;
      }
      if (dirty.portfolioProjects) {
        latest = (
          await apiFetch<Profile>(`/profile/${targetId}/portfolio-projects`, {
            method: "PATCH",
            body: JSON.stringify({
              // Hand-picked fields, no _id — the backend DTO has no _id
              // field and the global ValidationPipe is
              // forbidNonWhitelisted, so an unstripped _id (present on
              // every project the server returned) would 400 the whole
              // request.
              portfolioProjects: values.portfolioProjects.map((p) => ({
                title: p.title,
                description: p.description.trim() || undefined,
                liveUrl: p.liveUrl,
                githubUrl: p.githubUrl,
                technologies: p.technologies,
                startDate: p.startDate,
                endDate: p.isCurrent ? undefined : p.endDate,
                isCurrent: p.isCurrent,
              })),
              reason,
            }),
          })
        ).data;
      }
      return latest;
    },
    onSuccess: (latest) => {
      if (latest) applyProfile(latest);
    },
    onError: (err) => {
      // Defensive fallback: map a backend validation message back onto the
      // specific nested field it concerns. Zod already mirrors every DTO
      // constraint client-side, so this should rarely trigger in practice.
      if (!(err instanceof ApiError)) return;
      for (const raw of err.errors) {
        const nested = raw.match(/^portfolioProjects\.(\d+)\.(\w+)/);
        if (nested) {
          const path = `portfolioProjects.${nested[1]}.${nested[2]}` as Path<ProfileDetailsFormValues>;
          detailsForm.setError(path, { message: raw });
        } else if (raw.startsWith("headline")) {
          detailsForm.setError("headline", { message: raw });
        } else if (raw.startsWith("bio")) {
          detailsForm.setError("bio", { message: raw });
        } else if (raw.startsWith("skills")) {
          detailsForm.setError("skills", { message: raw });
        }
      }
    },
  });
  const detailsErrorMessage = mutationError(
    detailsMutation,
    "Failed to update profile details.",
  );

  // --- full name (admin-on-someone-else only — self-editing your own name
  // is handled by the Settings page via PATCH /auth/me, which requires a
  // current-password check this route intentionally does not have) ---
  const fullNameForm = useForm<FullNameFormValues>({
    resolver: zodResolver(fullNameSchema),
    defaultValues: { fullName: "", reason: "" },
  });
  useEffect(() => {
    if (!profile) return;
    fullNameForm.reset({ fullName: profile.fullName, reason: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const fullNameMutation = useMutation({
    mutationFn: async (values: FullNameFormValues) =>
      (
        await apiFetch<Profile>(`/users/${targetId}/fullname`, {
          method: "PATCH",
          body: JSON.stringify({
            fullName: values.fullName,
            reason: values.reason.trim() || undefined,
          }),
        })
      ).data,
    onSuccess: applyProfile,
  });
  const fullNameErrorMessage = mutationError(
    fullNameMutation,
    "Failed to update full name.",
  );

  // --- skills — folded into detailsForm/detailsMutation above; same
  // full-replace, no-per-item-identity shape as headline/bio, so it now
  // shares that single save button instead of its own. ---
  const [skillInput, setSkillInput] = useState("");
  const skills = detailsForm.watch("skills") ?? [];

  function addSkillLocally() {
    const trimmed = skillInput.trim();
    if (!trimmed || skills.includes(trimmed)) {
      setSkillInput("");
      return;
    }
    detailsForm.setValue("skills", [...skills, trimmed], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setSkillInput("");
  }

  function removeSkillLocally(skill: string) {
    detailsForm.setValue(
      "skills",
      skills.filter((s) => s !== skill),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Profile</p>
          <h1 className="text-2xl font-bold tracking-tight">Edit profile</h1>
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
                  href={`/profile/${user.id}`}
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
                  href={`/profile/${profile.id}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  View profile
                </Link>
              </div>

              {/* Headline, bio, skills & portfolio projects — one combined
                  form, one Save button below. */}
              <FormProvider {...detailsForm}>
                <section className="flex flex-col gap-4 border-b border-border p-5 sm:p-6">
                  <h2 className="text-sm font-semibold text-foreground">
                    Profile details
                  </h2>

                  {detailsErrorMessage && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                    >
                      {detailsErrorMessage}
                    </p>
                  )}
                  {detailsMutation.isSuccess && (
                    <p
                      role="status"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700"
                    >
                      Profile details updated.
                    </p>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-foreground">
                      Headline
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Full-stack developer"
                      {...detailsForm.register("headline")}
                      className={inputClass}
                    />
                    {detailsForm.formState.errors.headline && (
                      <span role="alert" className={errorTextClass}>
                        {detailsForm.formState.errors.headline.message}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-foreground">
                      Bio
                    </label>
                    <textarea
                      rows={3}
                      placeholder="A short bio..."
                      {...detailsForm.register("bio")}
                      className={textareaClass}
                    />
                    {detailsForm.formState.errors.bio && (
                      <span role="alert" className={errorTextClass}>
                        {detailsForm.formState.errors.bio.message}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">
                        Portfolio projects
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          projectFields.append(EMPTY_PORTFOLIO_PROJECT)
                        }
                        disabled={projectFields.fields.length >= 20}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-background disabled:opacity-60"
                      >
                        Add project
                      </button>
                    </div>

                    {projectFields.fields.length === 0 ? (
                      <p className="text-sm text-muted">
                        No portfolio projects yet.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {projectFields.fields.map((field, index) => (
                          <PortfolioProjectField
                            key={field.id}
                            index={index}
                            onRequestDelete={() =>
                              setPendingDeleteProjectIndex(index)
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      Skills
                    </p>

                    {skills.length === 0 ? (
                      <p className="text-sm text-muted">No skills yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {skills.map((skill) => (
                          <span
                            key={skill}
                            className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                          >
                            {skill}
                            <button
                              type="button"
                              onClick={() => removeSkillLocally(skill)}
                              aria-label={`Remove ${skill}`}
                              className="text-muted transition-colors hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {detailsForm.formState.errors.skills && (
                      <span role="alert" className={errorTextClass}>
                        {detailsForm.formState.errors.skills.message ??
                          detailsForm.formState.errors.skills.root?.message}
                      </span>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSkillLocally();
                          }
                        }}
                        placeholder="Add a skill (e.g. TypeScript)"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={addSkillLocally}
                        className="shrink-0 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {!isOwn && (
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      {...detailsForm.register("reason")}
                      className={inputClass}
                    />
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={detailsForm.handleSubmit((values) =>
                        detailsMutation.mutate(values),
                      )}
                      disabled={
                        detailsMutation.isPending ||
                        !detailsForm.formState.isDirty
                      }
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                    >
                      {detailsMutation.isPending
                        ? "Saving…"
                        : "Save profile details"}
                    </button>
                  </div>
                </section>
              </FormProvider>

              {/* Full name — admin-on-someone-else only. Self-editing your
                  own name is handled by Settings (PATCH /auth/me), which
                  has its own currentPassword gate this route doesn't. */}
              {!isOwn && (
                <section className="flex flex-col gap-3 border-b border-border p-5 sm:p-6">
                  <h2 className="text-sm font-semibold text-foreground">
                    Full name
                  </h2>

                  {fullNameErrorMessage && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                    >
                      {fullNameErrorMessage}
                    </p>
                  )}
                  {fullNameMutation.isSuccess && (
                    <p
                      role="status"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700"
                    >
                      Full name updated.
                    </p>
                  )}

                  <input
                    type="text"
                    aria-invalid={
                      fullNameForm.formState.errors.fullName
                        ? "true"
                        : "false"
                    }
                    {...fullNameForm.register("fullName")}
                    className={inputClass}
                  />
                  {fullNameForm.formState.errors.fullName && (
                    <span role="alert" className={errorTextClass}>
                      {fullNameForm.formState.errors.fullName.message}
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    {...fullNameForm.register("reason")}
                    className={inputClass}
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={fullNameForm.handleSubmit((values) =>
                        fullNameMutation.mutate(values),
                      )}
                      disabled={fullNameMutation.isPending}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                    >
                      {fullNameMutation.isPending
                        ? "Saving…"
                        : "Save full name"}
                    </button>
                  </div>
                </section>
              )}

            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteProjectIndex !== null}
        title="Remove project"
        message="Remove this portfolio project? This isn't saved until you click Save profile details."
        showReasonInput={false}
        onConfirm={() => {
          if (pendingDeleteProjectIndex !== null) {
            projectFields.remove(pendingDeleteProjectIndex);
          }
          setPendingDeleteProjectIndex(null);
        }}
        onCancel={() => setPendingDeleteProjectIndex(null)}
      />
    </main>
  );
}
