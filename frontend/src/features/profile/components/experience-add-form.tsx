"use client";

import { useAddExperience } from "@/features/profile/mutations/profile-mutations";
import {
  experienceSchema,
  type ExperienceFormValues,
} from "@/features/profile/schemas/profile-details-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  EMPTY_EXPERIENCE_DRAFT,
  ExperienceFields,
} from "./experience-fields";
import { mutationError } from "./form-styles";

export function ExperienceAddForm({
  profileId,
  isOwn,
}: {
  profileId: string;
  isOwn: boolean;
}) {
  const form = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: EMPTY_EXPERIENCE_DRAFT,
  });

  const mutation = useAddExperience(profileId, {
    onSuccess: () => form.reset(EMPTY_EXPERIENCE_DRAFT),
  });
  const errorMessage = mutationError(mutation, "Failed to add experience.");

  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        mutation.mutate({
          title: values.title,
          company: values.company,
          from: values.from,
          // Left blank = ongoing: omit entirely rather than send "".
          to: values.to.trim() || undefined,
          description: values.description.trim() || undefined,
          reason: values.reason.trim() || undefined,
        }),
      )}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-4"
    >
      <p className="text-sm font-semibold text-white">Add experience</p>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300"
        >
          {errorMessage}
        </p>
      )}

      <ExperienceFields form={form} isOwn={isOwn} />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? "Adding…" : "Add experience"}
        </button>
      </div>
    </form>
  );
}
