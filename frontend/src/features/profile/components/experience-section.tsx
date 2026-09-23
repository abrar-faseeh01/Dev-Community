"use client";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  useDeleteExperience,
  useUpdateExperience,
} from "@/features/profile/mutations/profile-mutations";
import {
  experienceSchema,
  type ExperienceFormValues,
} from "@/features/profile/schemas/profile-details-schema";
import type { Experience, Profile } from "@/features/profile/types/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ExperienceAddForm } from "./experience-add-form";
import {
  EMPTY_EXPERIENCE_DRAFT,
  ExperienceFields,
} from "./experience-fields";
import { mutationError } from "./form-styles";

export function ExperienceSection({
  profile,
  isOwn,
}: {
  profile: Profile;
  isOwn: boolean;
}) {
  // Single active slot: only one experience can be in edit mode at a time.
  const [editingExperienceId, setEditingExperienceId] = useState<
    string | null
  >(null);
  const editForm = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: EMPTY_EXPERIENCE_DRAFT,
  });
  const [pendingDeleteExperienceId, setPendingDeleteExperienceId] = useState<
    string | null
  >(null);

  const editMutation = useUpdateExperience(profile.id, {
    onSuccess: () => setEditingExperienceId(null),
  });
  const deleteMutation = useDeleteExperience(profile.id);

  const errorMessage =
    mutationError(editMutation, "Failed to update experience.") ||
    mutationError(deleteMutation, "Failed to delete experience.");

  function startEditing(exp: Experience) {
    if (!exp._id) return;
    setEditingExperienceId(exp._id);
    editForm.reset({
      title: exp.title,
      company: exp.company,
      from: exp.from,
      to: exp.to ?? "",
      description: exp.description ?? "",
      reason: "",
    });
  }

  function confirmDelete(reason?: string) {
    const experienceId = pendingDeleteExperienceId;
    if (!experienceId) return;
    setPendingDeleteExperienceId(null);
    deleteMutation.mutate({ experienceId, reason });
  }

  return (
    <>
      <section className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white">Experience</h2>

        {errorMessage && (
          <p
            role="alert"
            className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300"
          >
            {errorMessage}
          </p>
        )}

        {profile.experiences.length === 0 ? (
          <p className="text-sm text-neutral-400">No experience yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {profile.experiences.map((exp) => {
              const isEditing = !!exp._id && exp._id === editingExperienceId;
              const isBusy =
                !!exp._id &&
                ((deleteMutation.isPending &&
                  deleteMutation.variables?.experienceId === exp._id) ||
                  (editMutation.isPending &&
                    editMutation.variables?.experienceId === exp._id));

              if (isEditing && exp._id) {
                const experienceId = exp._id;
                return (
                  <form
                    key={experienceId}
                    onSubmit={editForm.handleSubmit((values) =>
                      editMutation.mutate({
                        experienceId,
                        payload: {
                          title: values.title,
                          company: values.company,
                          from: values.from,
                          // Unlike add: send the literal value (possibly "")
                          // so clearing an end date on an EXISTING entry
                          // actually takes effect — omitting the key here
                          // would mean "leave unchanged", not "clear it",
                          // since this is a partial update.
                          to: values.to.trim(),
                          description: values.description.trim(),
                          reason: values.reason.trim() || undefined,
                        },
                      }),
                    )}
                    noValidate
                    className="flex flex-col gap-3 rounded-lg border border-emerald-400/30 bg-neutral-950 p-4"
                  >
                    <ExperienceFields form={editForm} isOwn={isOwn} />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingExperienceId(null)}
                        className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={editMutation.isPending}
                        className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {editMutation.isPending ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <div
                  key={exp._id ?? `${exp.title}-${exp.company}`}
                  className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {exp.title}
                      </p>
                      <p className="text-sm text-neutral-400">
                        {exp.company} · {exp.from} – {exp.to || "Present"}
                      </p>
                      {exp.description && (
                        <p className="mt-2 text-sm text-neutral-200">
                          {exp.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-3 text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => startEditing(exp)}
                        className="text-emerald-400 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          exp._id && setPendingDeleteExperienceId(exp._id)
                        }
                        className="text-red-400 hover:underline disabled:opacity-60"
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

        <ExperienceAddForm profileId={profile.id} isOwn={isOwn} />
      </section>

      <ConfirmDialog
        open={!!pendingDeleteExperienceId}
        title="Delete experience"
        message="Delete this experience? This cannot be undone."
        showReasonInput={!isOwn}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteExperienceId(null)}
      />
    </>
  );
}
