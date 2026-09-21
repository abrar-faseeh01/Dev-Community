"use client";

import type { ProfileDetailsFormValues } from "@/features/profile/schemas/profile-details-schema";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";
const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";
const errorTextClass = "text-sm text-red-600";

type Props = {
  index: number;
  onRequestDelete: () => void;
};

// One row of the portfolioProjects useFieldArray, kept as its own
// component (rather than inlined in the edit page) so this row's
// technologies-chip state stays scoped to the row instead of growing the
// already-large page file further. Reads/writes the parent's single
// <FormProvider> form via useFormContext — the standard RHF pattern for
// extracting one field-array row into its own component.
export function PortfolioProjectField({ index, onRequestDelete }: Props) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ProfileDetailsFormValues>();
  const [techInput, setTechInput] = useState("");

  const technologies = watch(`portfolioProjects.${index}.technologies`) ?? [];
  const isCurrent = watch(`portfolioProjects.${index}.isCurrent`);
  const projectErrors = errors.portfolioProjects?.[index];

  function addTech() {
    const trimmed = techInput.trim();
    if (!trimmed || technologies.includes(trimmed)) {
      setTechInput("");
      return;
    }
    setValue(`portfolioProjects.${index}.technologies`, [...technologies, trimmed], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTechInput("");
  }

  function removeTech(tech: string) {
    setValue(
      `portfolioProjects.${index}.technologies`,
      technologies.filter((t) => t !== tech),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          Project {index + 1}
        </p>
        <button
          type="button"
          onClick={onRequestDelete}
          className="text-sm font-medium text-red-600 hover:underline"
        >
          Remove
        </button>
      </div>

      <input
        type="text"
        placeholder="Title"
        {...register(`portfolioProjects.${index}.title`)}
        className={inputClass}
      />
      {projectErrors?.title && (
        <span role="alert" className={errorTextClass}>
          {projectErrors.title.message}
        </span>
      )}

      <textarea
        placeholder="Description (optional)"
        rows={2}
        {...register(`portfolioProjects.${index}.description`)}
        className={textareaClass}
      />
      {projectErrors?.description && (
        <span role="alert" className={errorTextClass}>
          {projectErrors.description.message}
        </span>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <input
            type="text"
            placeholder="Live URL (https://...)"
            {...register(`portfolioProjects.${index}.liveUrl`)}
            className={inputClass}
          />
          {projectErrors?.liveUrl && (
            <span role="alert" className={errorTextClass}>
              {projectErrors.liveUrl.message}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <input
            type="text"
            placeholder="GitHub URL (https://...)"
            {...register(`portfolioProjects.${index}.githubUrl`)}
            className={inputClass}
          />
          {projectErrors?.githubUrl && (
            <span role="alert" className={errorTextClass}>
              {projectErrors.githubUrl.message}
            </span>
          )}
        </div>
      </div>

      {technologies.length === 0 ? (
        <p className="text-sm text-muted">No technologies listed yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {technologies.map((tech) => (
            <span
              key={tech}
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
            >
              {tech}
              <button
                type="button"
                onClick={() => removeTech(tech)}
                aria-label={`Remove ${tech}`}
                className="text-muted transition-colors hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={techInput}
          onChange={(e) => setTechInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTech();
            }
          }}
          placeholder="Add a technology (e.g. TypeScript)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={addTech}
          className="shrink-0 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
        >
          Add
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted">
            Start date
          </label>
          <input
            type="date"
            {...register(`portfolioProjects.${index}.startDate`)}
            className={inputClass}
          />
          {projectErrors?.startDate && (
            <span role="alert" className={errorTextClass}>
              {projectErrors.startDate.message}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted">End date</label>
          <input
            type="date"
            disabled={isCurrent}
            {...register(`portfolioProjects.${index}.endDate`)}
            className={`${inputClass} disabled:opacity-60`}
          />
          {projectErrors?.endDate && (
            <span role="alert" className={errorTextClass}>
              {projectErrors.endDate.message}
            </span>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isCurrent}
          // Not a spread `register()` here on purpose — isCurrent flipping
          // to true must also clear endDate in the same interaction, and
          // that side effect needs to run only on an actual user click, not
          // on every render/mount (a useEffect keyed on the watched value
          // would also fire once on initial hydration and mark the row
          // dirty for data that was never actually touched).
          onChange={(e) => {
            const checked = e.target.checked;
            setValue(`portfolioProjects.${index}.isCurrent`, checked, {
              shouldDirty: true,
              shouldValidate: true,
            });
            if (checked) {
              setValue(`portfolioProjects.${index}.endDate`, "", {
                shouldDirty: true,
                shouldValidate: true,
              });
            }
          }}
        />
        This is my current project
      </label>
    </div>
  );
}
