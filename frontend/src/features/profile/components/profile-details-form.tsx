"use client";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useUpdateProfileDetails } from "@/features/profile/mutations/profile-mutations";
import {
  profileDetailsSchema,
  type ProfileDetailsFormValues,
} from "@/features/profile/schemas/profile-details-schema";
import type { Profile } from "@/features/profile/types/profile";
import { ApiError } from "@/lib/axios/api-error";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  type Path,
} from "react-hook-form";
import {
  errorTextClass,
  inputClass,
  mutationError,
  textareaClass,
} from "./form-styles";
import { PortfolioProjectField } from "./portfolio-project-field";
import { SkillsEditor } from "./skills-editor";

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

// Headline, bio, skills and portfolio projects: one combined form with one
// Save button, sending only the sections that actually changed.
export function ProfileDetailsForm({
  profile,
  isOwn,
}: {
  profile: Profile;
  isOwn: boolean;
}) {
  const form = useForm<ProfileDetailsFormValues>({
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
    form.reset({
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
    control: form.control,
    name: "portfolioProjects",
  });
  const [pendingDeleteProjectIndex, setPendingDeleteProjectIndex] = useState<
    number | null
  >(null);

  const mutation = useUpdateProfileDetails(profile.id, {
    onError: (err) => {
      // Defensive fallback: map a backend validation message back onto the
      // specific nested field it concerns. Zod already mirrors every DTO
      // constraint client-side, so this should rarely trigger in practice.
      if (!(err instanceof ApiError)) return;
      for (const raw of err.errors) {
        const nested = raw.match(/^portfolioProjects\.(\d+)\.(\w+)/);
        if (nested) {
          const path = `portfolioProjects.${nested[1]}.${nested[2]}` as Path<ProfileDetailsFormValues>;
          form.setError(path, { message: raw });
        } else if (raw.startsWith("headline")) {
          form.setError("headline", { message: raw });
        } else if (raw.startsWith("bio")) {
          form.setError("bio", { message: raw });
        } else if (raw.startsWith("skills")) {
          form.setError("skills", { message: raw });
        }
      }
    },
  });
  const errorMessage = mutationError(
    mutation,
    "Failed to update profile details.",
  );

  return (
    <>
      <FormProvider {...form}>
        <section className="flex flex-col gap-4 border-b border-border p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground">
            Profile details
          </h2>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </p>
          )}
          {mutation.isSuccess && (
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
              {...form.register("headline")}
              className={inputClass}
            />
            {form.formState.errors.headline && (
              <span role="alert" className={errorTextClass}>
                {form.formState.errors.headline.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">Bio</label>
            <textarea
              rows={3}
              placeholder="A short bio..."
              {...form.register("bio")}
              className={textareaClass}
            />
            {form.formState.errors.bio && (
              <span role="alert" className={errorTextClass}>
                {form.formState.errors.bio.message}
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
                onClick={() => projectFields.append(EMPTY_PORTFOLIO_PROJECT)}
                disabled={projectFields.fields.length >= 20}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-background disabled:opacity-60"
              >
                Add project
              </button>
            </div>

            {projectFields.fields.length === 0 ? (
              <p className="text-sm text-muted">No portfolio projects yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {projectFields.fields.map((field, index) => (
                  <PortfolioProjectField
                    key={field.id}
                    index={index}
                    onRequestDelete={() => setPendingDeleteProjectIndex(index)}
                  />
                ))}
              </div>
            )}
          </div>

          <SkillsEditor />

          {!isOwn && (
            <input
              type="text"
              placeholder="Reason (optional)"
              {...form.register("reason")}
              className={inputClass}
            />
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={form.handleSubmit((values) =>
                mutation.mutate({
                  values,
                  dirty: form.formState.dirtyFields,
                }),
              )}
              disabled={mutation.isPending || !form.formState.isDirty}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
            >
              {mutation.isPending ? "Saving…" : "Save profile details"}
            </button>
          </div>
        </section>
      </FormProvider>

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
    </>
  );
}
