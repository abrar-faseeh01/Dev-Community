"use client";

import type { ProfileDetailsFormValues } from "@/features/profile/schemas/profile-details-schema";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { errorTextClass, inputClass } from "./form-styles";

// The skills list inside the profile details form. Adding and removing only
// change the form's `skills` value (and mark it dirty); nothing is saved
// until the form's single Save button.
export function SkillsEditor() {
  const form = useFormContext<ProfileDetailsFormValues>();
  const [skillInput, setSkillInput] = useState("");
  const skills = useWatch({ control: form.control, name: "skills" }) ?? [];

  function addSkillLocally() {
    const trimmed = skillInput.trim();
    if (!trimmed || skills.includes(trimmed)) {
      setSkillInput("");
      return;
    }
    form.setValue("skills", [...skills, trimmed], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setSkillInput("");
  }

  function removeSkillLocally(skill: string) {
    form.setValue(
      "skills",
      skills.filter((s) => s !== skill),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">Skills</p>

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
      {form.formState.errors.skills && (
        <span role="alert" className={errorTextClass}>
          {form.formState.errors.skills.message ??
            form.formState.errors.skills.root?.message}
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
  );
}
