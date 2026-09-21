"use client";

import type { ExperienceFormValues } from "@/features/profile/schemas/profile-details-schema";
import type { UseFormReturn } from "react-hook-form";
import { errorTextClass, inputClass, textareaClass } from "./form-styles";

export const EMPTY_EXPERIENCE_DRAFT: ExperienceFormValues = {
  title: "",
  company: "",
  from: "",
  to: "",
  description: "",
  reason: "",
};

// The inputs shared by "add experience" and the inline "edit experience"
// form; each supplies its own form instance and buttons.
export function ExperienceFields({
  form,
  isOwn,
}: {
  form: UseFormReturn<ExperienceFormValues>;
  isOwn: boolean;
}) {
  const { errors } = form.formState;

  return (
    <>
      <input
        type="text"
        placeholder="Title"
        {...form.register("title")}
        className={inputClass}
      />
      {errors.title && (
        <span role="alert" className={errorTextClass}>
          {errors.title.message}
        </span>
      )}
      <input
        type="text"
        placeholder="Company"
        {...form.register("company")}
        className={inputClass}
      />
      {errors.company && (
        <span role="alert" className={errorTextClass}>
          {errors.company.message}
        </span>
      )}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="From (e.g. 2020)"
          {...form.register("from")}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="To — leave blank if ongoing"
          {...form.register("to")}
          className={inputClass}
        />
      </div>
      {errors.from && (
        <span role="alert" className={errorTextClass}>
          {errors.from.message}
        </span>
      )}
      <textarea
        placeholder="Description (optional)"
        rows={2}
        {...form.register("description")}
        className={textareaClass}
      />
      {!isOwn && (
        <input
          type="text"
          placeholder="Reason (optional)"
          {...form.register("reason")}
          className={inputClass}
        />
      )}
    </>
  );
}
