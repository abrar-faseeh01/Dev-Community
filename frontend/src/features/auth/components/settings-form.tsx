"use client";

import { PasswordInput } from "@/components/forms/password-input";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useUpdateCredentials } from "@/features/auth/mutations/auth-mutations";
import {
  updateCredentialsSchema,
  type UpdateCredentialsFormValues,
} from "@/features/auth/schemas/auth-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

const emptyValues: UpdateCredentialsFormValues = {
  currentPassword: "",
  newFullName: "",
  newEmail: "",
  newPassword: "",
};

const inputClass =
  "h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";

export function SettingsForm() {
  const { user } = useAuth();
  const updateMutation = useUpdateCredentials();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateCredentialsFormValues>({
    resolver: zodResolver(updateCredentialsSchema),
    defaultValues: emptyValues,
  });

  function onSubmit(values: UpdateCredentialsFormValues) {
    if (updateMutation.isPending) return;
    updateMutation.reset();
    // A blank "new" field means "leave that as it is", so it isn't sent.
    updateMutation.mutate(
      {
        currentPassword: values.currentPassword,
        newFullName: values.newFullName.trim() || undefined,
        newEmail: values.newEmail.trim() || undefined,
        newPassword: values.newPassword || undefined,
      },
      { onSuccess: () => reset(emptyValues) },
    );
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Account</p>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted">
            Change your account credentials.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <p className="mt-1 text-sm text-muted">
              Signed in as {user?.fullName}
            </p>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-5 p-5 sm:p-6"
          >
            {updateMutation.isError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to update account."}
              </p>
            )}

            {updateMutation.isSuccess && (
              <p
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700"
              >
                Account updated.
              </p>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Full name</span>
              <input
                type="text"
                aria-invalid={errors.newFullName ? "true" : "false"}
                {...register("newFullName")}
                placeholder={user?.fullName}
                className={inputClass}
              />
              {errors.newFullName && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.newFullName.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Current password</span>
              <PasswordInput
                aria-invalid={errors.currentPassword ? "true" : "false"}
                {...register("currentPassword")}
                className={inputClass}
              />
              {errors.currentPassword && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.currentPassword.message}
                </span>
              )}
            </label>

            {user?.role === "admin" && (
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>New email</span>

                <input
                  type="email"
                  aria-invalid={errors.newEmail ? "true" : "false"}
                  {...register("newEmail")}
                  className={inputClass}
                />
                {errors.newEmail && (
                  <span role="alert" className="text-sm text-red-600">
                    {errors.newEmail.message}
                  </span>
                )}
              </label>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>New password</span>
              {user?.role === "admin" && (
                <span className="font-normal text-xs text-muted">
                  Leave blank if you only want to change your email.
                </span>
              )}
              <PasswordInput
                placeholder="Minimum 8 characters"
                aria-invalid={errors.newPassword ? "true" : "false"}
                {...register("newPassword")}
                className={inputClass}
              />
              {errors.newPassword && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.newPassword.message}
                </span>
              )}
            </label>

            <div className="flex justify-end border-t border-border pt-5">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
