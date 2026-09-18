"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  experienceSchema,
  type ExperienceFormValues,
} from "@/lib/schemas/profile-details";
import type { Experience, Profile } from "@/lib/types/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

const EMPTY_EXPERIENCE_DRAFT: ExperienceFormValues = {
  title: "",
  company: "",
  from: "",
  to: "",
  description: "",
  reason: "",
};

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";
const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";
const errorTextClass = "text-sm text-red-600";

// Same helper as frontend/app/profile/edit/[id]/page.tsx — experience has
// its own independent add/edit/delete useMutations, saving immediately via
// the same granular endpoints it always used, on this now-separate page.
function mutationError(
  mutation: { isError: boolean; error: unknown },
  fallback: string,
): string {
  if (!mutation.isError) return "";
  return mutation.error instanceof Error ? mutation.error.message : fallback;
}

export default function EditExperiencePage() {
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

  // Same ["profile", targetId] query key as the profile-info edit page and
  // the view page — a save on any of the three pages calls
  // queryClient.setQueryData on this exact key, so this page always reads
  // (and writes back) the one shared cache entry.
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

  // --- add experience ---
  const addExperienceForm = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: EMPTY_EXPERIENCE_DRAFT,
  });

  const addExperienceMutation = useMutation({
    mutationFn: async (values: ExperienceFormValues) =>
      (
        await apiFetch<Profile>(`/profile/${targetId}/experiences`, {
          method: "POST",
          body: JSON.stringify({
            title: values.title,
            company: values.company,
            from: values.from,
            // Left blank = ongoing: omit entirely rather than send "".
            to: values.to.trim() || undefined,
            description: values.description.trim() || undefined,
            reason: values.reason.trim() || undefined,
          }),
        })
      ).data,
    onSuccess: (next) => {
      applyProfile(next);
      addExperienceForm.reset(EMPTY_EXPERIENCE_DRAFT);
    },
  });
  const addExperienceErrorMessage = mutationError(
    addExperienceMutation,
    "Failed to add experience.",
  );

  // --- edit / delete experience (single active slot, same as before —
  // only one experience can be in edit mode at a time) ---
  const [editingExperienceId, setEditingExperienceId] = useState<
    string | null
  >(null);
  const editExperienceForm = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: EMPTY_EXPERIENCE_DRAFT,
  });
  const [pendingDeleteExperienceId, setPendingDeleteExperienceId] = useState<
    string | null
  >(null);

  const editExperienceMutation = useMutation({
    mutationFn: async ({
      experienceId,
      values,
    }: {
      experienceId: string;
      values: ExperienceFormValues;
    }) =>
      (
        await apiFetch<Profile>(
          `/profile/${targetId}/experiences/${experienceId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              title: values.title,
              company: values.company,
              from: values.from,
              // Unlike add: send the literal value (possibly "") so
              // clearing an end date on an EXISTING entry actually takes
              // effect — omitting the key here would mean "leave
              // unchanged", not "clear it", since this is a partial update.
              to: values.to.trim(),
              description: values.description.trim(),
              reason: values.reason.trim() || undefined,
            }),
          },
        )
      ).data,
    onSuccess: (next) => {
      applyProfile(next);
      setEditingExperienceId(null);
    },
  });

  const deleteExperienceMutation = useMutation({
    mutationFn: async ({
      experienceId,
      reason,
    }: {
      experienceId: string;
      reason?: string;
    }) =>
      (
        await apiFetch<Profile>(
          `/profile/${targetId}/experiences/${experienceId}`,
          { method: "DELETE", body: JSON.stringify({ reason }) },
        )
      ).data,
    onSuccess: applyProfile,
  });

  const experiencesErrorMessage =
    mutationError(editExperienceMutation, "Failed to update experience.") ||
    mutationError(deleteExperienceMutation, "Failed to delete experience.");

  function startEditingExperience(exp: Experience) {
    if (!exp._id) return;
    setEditingExperienceId(exp._id);
    editExperienceForm.reset({
      title: exp.title,
      company: exp.company,
      from: exp.from,
      to: exp.to ?? "",
      description: exp.description ?? "",
      reason: "",
    });
  }

  function cancelEditingExperience() {
    setEditingExperienceId(null);
  }

  function handleDeleteExperience(experienceId: string) {
    setPendingDeleteExperienceId(experienceId);
  }

  function confirmDeleteExperience(reason?: string) {
    const experienceId = pendingDeleteExperienceId;
    if (!experienceId) return;
    setPendingDeleteExperienceId(null);
    deleteExperienceMutation.mutate({ experienceId, reason });
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Profile</p>
          <h1 className="text-2xl font-bold tracking-tight">
            Edit experience
          </h1>
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
              {/* Same header bar as the profile-info edit page, including
                  the same "View profile" link — both edit pages are
                  entered as siblings from the view page, not from each
                  other, so linking back there (not to the other edit
                  page) keeps this page's only way "out" consistent with
                  how the user got in. */}
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

              {/* Experience */}
              <section className="flex flex-col gap-4 p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-foreground">
                  Experience
                </h2>

                {experiencesErrorMessage && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                  >
                    {experiencesErrorMessage}
                  </p>
                )}

                {profile.experiences.length === 0 ? (
                  <p className="text-sm text-muted">No experience yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {profile.experiences.map((exp) => {
                      const isEditing =
                        !!exp._id && exp._id === editingExperienceId;
                      const isBusy =
                        !!exp._id &&
                        ((deleteExperienceMutation.isPending &&
                          deleteExperienceMutation.variables
                            ?.experienceId === exp._id) ||
                          (editExperienceMutation.isPending &&
                            editExperienceMutation.variables
                              ?.experienceId === exp._id));

                      if (isEditing && exp._id) {
                        const experienceId = exp._id;
                        return (
                          <form
                            key={experienceId}
                            onSubmit={editExperienceForm.handleSubmit(
                              (values) =>
                                editExperienceMutation.mutate({
                                  experienceId,
                                  values,
                                }),
                            )}
                            noValidate
                            className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-background p-4"
                          >
                            <input
                              type="text"
                              placeholder="Title"
                              {...editExperienceForm.register("title")}
                              className={inputClass}
                            />
                            {editExperienceForm.formState.errors.title && (
                              <span role="alert" className={errorTextClass}>
                                {
                                  editExperienceForm.formState.errors.title
                                    .message
                                }
                              </span>
                            )}
                            <input
                              type="text"
                              placeholder="Company"
                              {...editExperienceForm.register("company")}
                              className={inputClass}
                            />
                            {editExperienceForm.formState.errors.company && (
                              <span role="alert" className={errorTextClass}>
                                {
                                  editExperienceForm.formState.errors.company
                                    .message
                                }
                              </span>
                            )}
                            <div className="flex gap-3">
                              <input
                                type="text"
                                placeholder="From (e.g. 2020)"
                                {...editExperienceForm.register("from")}
                                className={inputClass}
                              />
                              <input
                                type="text"
                                placeholder="To — leave blank if ongoing"
                                {...editExperienceForm.register("to")}
                                className={inputClass}
                              />
                            </div>
                            {editExperienceForm.formState.errors.from && (
                              <span role="alert" className={errorTextClass}>
                                {
                                  editExperienceForm.formState.errors.from
                                    .message
                                }
                              </span>
                            )}
                            <textarea
                              placeholder="Description (optional)"
                              rows={2}
                              {...editExperienceForm.register("description")}
                              className={textareaClass}
                            />
                            {!isOwn && (
                              <input
                                type="text"
                                placeholder="Reason (optional)"
                                {...editExperienceForm.register("reason")}
                                className={inputClass}
                              />
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEditingExperience}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={editExperienceMutation.isPending}
                                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                              >
                                {editExperienceMutation.isPending
                                  ? "Saving…"
                                  : "Save"}
                              </button>
                            </div>
                          </form>
                        );
                      }

                      return (
                        <div
                          key={exp._id ?? `${exp.title}-${exp.company}`}
                          className="rounded-lg border border-border bg-background p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {exp.title}
                              </p>
                              <p className="text-sm text-muted">
                                {exp.company} · {exp.from} –{" "}
                                {exp.to || "Present"}
                              </p>
                              {exp.description && (
                                <p className="mt-2 text-sm text-foreground">
                                  {exp.description}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-3 text-sm font-medium">
                              <button
                                type="button"
                                onClick={() => startEditingExperience(exp)}
                                className="text-accent hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  exp._id && handleDeleteExperience(exp._id)
                                }
                                className="text-red-600 hover:underline disabled:opacity-60"
                              >
                                {isBusy ? "…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <form
                  onSubmit={addExperienceForm.handleSubmit((values) =>
                    addExperienceMutation.mutate(values),
                  )}
                  noValidate
                  className="flex flex-col gap-3 rounded-lg border border-border p-4"
                >
                  <p className="text-sm font-semibold text-foreground">
                    Add experience
                  </p>

                  {addExperienceErrorMessage && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                    >
                      {addExperienceErrorMessage}
                    </p>
                  )}

                  <input
                    type="text"
                    placeholder="Title"
                    {...addExperienceForm.register("title")}
                    className={inputClass}
                  />
                  {addExperienceForm.formState.errors.title && (
                    <span role="alert" className={errorTextClass}>
                      {addExperienceForm.formState.errors.title.message}
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder="Company"
                    {...addExperienceForm.register("company")}
                    className={inputClass}
                  />
                  {addExperienceForm.formState.errors.company && (
                    <span role="alert" className={errorTextClass}>
                      {addExperienceForm.formState.errors.company.message}
                    </span>
                  )}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="From (e.g. 2020)"
                      {...addExperienceForm.register("from")}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      placeholder="To — leave blank if ongoing"
                      {...addExperienceForm.register("to")}
                      className={inputClass}
                    />
                  </div>
                  {addExperienceForm.formState.errors.from && (
                    <span role="alert" className={errorTextClass}>
                      {addExperienceForm.formState.errors.from.message}
                    </span>
                  )}
                  <textarea
                    placeholder="Description (optional)"
                    rows={2}
                    {...addExperienceForm.register("description")}
                    className={textareaClass}
                  />

                  {!isOwn && (
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      {...addExperienceForm.register("reason")}
                      className={inputClass}
                    />
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={addExperienceMutation.isPending}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                    >
                      {addExperienceMutation.isPending
                        ? "Adding…"
                        : "Add experience"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteExperienceId}
        title="Delete experience"
        message="Delete this experience? This cannot be undone."
        showReasonInput={!isOwn}
        onConfirm={confirmDeleteExperience}
        onCancel={() => setPendingDeleteExperienceId(null)}
      />
    </main>
  );
}
