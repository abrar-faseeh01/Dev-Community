"use client";

import { useUpdateFullName } from "@/features/profile/mutations/profile-mutations";
import {
  fullNameSchema,
  type FullNameFormValues,
} from "@/features/profile/schemas/profile-details-schema";
import type { Profile } from "@/features/profile/types/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { errorTextClass, inputClass, mutationError } from "./form-styles";

// Full name — admin-on-someone-else only. Self-editing your own name is
// handled by Settings (PATCH /auth/me), which has its own currentPassword
// gate this route doesn't.
export function FullNameForm({ profile }: { profile: Profile }) {
  const form = useForm<FullNameFormValues>({
    resolver: zodResolver(fullNameSchema),
    defaultValues: { fullName: "", reason: "" },
  });
  useEffect(() => {
    form.reset({ fullName: profile.fullName, reason: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const mutation = useUpdateFullName(profile.id);
  const errorMessage = mutationError(mutation, "Failed to update full name.");

  return (
    <section className="flex flex-col gap-3 border-b border-border p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-foreground">Full name</h2>

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
          Full name updated.
        </p>
      )}

      <input
        type="text"
        aria-invalid={form.formState.errors.fullName ? "true" : "false"}
        {...form.register("fullName")}
        className={inputClass}
      />
      {form.formState.errors.fullName && (
        <span role="alert" className={errorTextClass}>
          {form.formState.errors.fullName.message}
        </span>
      )}
      <input
        type="text"
        placeholder="Reason (optional)"
        {...form.register("reason")}
        className={inputClass}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={form.handleSubmit((values) =>
            mutation.mutate({
              fullName: values.fullName,
              reason: values.reason.trim() || undefined,
            }),
          )}
          disabled={mutation.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {mutation.isPending ? "Saving…" : "Save full name"}
        </button>
      </div>
    </section>
  );
}
