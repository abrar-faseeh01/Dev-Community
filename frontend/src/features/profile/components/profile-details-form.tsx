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
import { createPortal } from "react-dom";
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
  footerSlot,
}: {
  profile: Profile;
  isOwn: boolean;
  // Portal target rendered by ProfileEditShell just below the edit box, so
  // Save changes sits outside the card while its disabled/pending state and
  // click handler stay owned right here, next to the form and mutation they
  // read from.
  footerSlot: HTMLDivElement | null;
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

  function submit() {
    form.handleSubmit((values) =>
      mutation.mutate({
        values,
        dirty: form.formState.dirtyFields,
      }),
    )();
  }

  // Lands the reader on the Skills or Portfolio section when they arrive via
  // one of the Profile view's per-tab Edit links (#skills / #portfolio).
  // Next's own hash-scroll fires before this page's data has loaded (nothing
  // with that id exists yet), so this does it manually, once, right after
  // the sections it targets actually mount.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash !== "skills" && hash !== "portfolio") return;
    document.getElementById(hash)?.scrollIntoView({ block: "start" });
    document.getElementById(`${hash}-heading`)?.focus();
  }, []);

  return (
    <>
      <FormProvider {...form}>
        <section className="flex flex-col gap-6 p-5 sm:p-6">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300"
            >
              {errorMessage}
            </p>
          )}
          {mutation.isSuccess && (
            <p
              role="status"
              className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-300"
            >
              Profile details updated.
            </p>
          )}

          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-white">Basics</h2>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-white">
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
              <label className="text-sm font-medium text-white">Bio</label>
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

            <div id="skills" className="scroll-mt-32">
              <SkillsEditor />
            </div>
          </div>

          <div id="portfolio" className="flex flex-col gap-3 scroll-mt-32">
            <div className="flex items-center justify-between">
              <h2
                id="portfolio-heading"
                tabIndex={-1}
                className="text-sm font-semibold text-white focus:outline-none"
              >
                Portfolio projects
              </h2>
              <button
                type="button"
                onClick={() => projectFields.append(EMPTY_PORTFOLIO_PROJECT)}
                disabled={projectFields.fields.length >= 20}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
              >
                Add project
              </button>
            </div>

            {projectFields.fields.length === 0 ? (
              <p className="text-sm text-neutral-400">
                No portfolio projects yet.
              </p>
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

          {!isOwn && (
            <input
              type="text"
              placeholder="Reason (optional)"
              {...form.register("reason")}
              className={inputClass}
            />
          )}
        </section>
      </FormProvider>

      {footerSlot &&
        createPortal(
          <button
            type="button"
            onClick={submit}
            disabled={mutation.isPending || !form.formState.isDirty}
            className="rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </button>,
          footerSlot,
        )}

      <ConfirmDialog
        open={pendingDeleteProjectIndex !== null}
        title="Remove project"
        message="Remove this portfolio project? This isn't saved until you click Save changes."
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
