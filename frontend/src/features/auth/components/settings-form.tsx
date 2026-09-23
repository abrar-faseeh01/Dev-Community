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
  "h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15";
const errorTextClass = "text-sm text-red-400";

export function SettingsForm() {
  const { user } = useAuth();
  const updateMutation = useUpdateCredentials();
  const isAdmin = user?.role === "admin";

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
    <main className="flex flex-1 justify-center bg-neutral-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-emerald-400">
            {isAdmin ? "Admin" : "Account"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Settings
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Change your account credentials.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 px-5 py-4 sm:px-6">
            <p className="text-sm text-neutral-400">
              Signed in as{" "}
              <span className="font-semibold text-white">
                {user?.fullName}
              </span>
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
                className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300"
              >
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to update account."}
              </p>
            )}

            {updateMutation.isSuccess && (
              <p
                role="status"
                className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-300"
              >
                Account updated.
              </p>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium text-white">
              <span>Full name</span>
              <input
                type="text"
                aria-invalid={errors.newFullName ? "true" : "false"}
                {...register("newFullName")}
                placeholder={user?.fullName}
                className={inputClass}
              />
              {errors.newFullName && (
                <span role="alert" className={errorTextClass}>
                  {errors.newFullName.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-white">
              <span>Current password</span>
              <PasswordInput
                aria-invalid={errors.currentPassword ? "true" : "false"}
                {...register("currentPassword")}
                className={inputClass}
              />
              {errors.currentPassword && (
                <span role="alert" className={errorTextClass}>
                  {errors.currentPassword.message}
                </span>
              )}
            </label>

            {isAdmin && (
              <label className="flex flex-col gap-2 text-sm font-medium text-white">
                <span>New email</span>
                <input
                  type="email"
                  aria-invalid={errors.newEmail ? "true" : "false"}
                  {...register("newEmail")}
                  className={inputClass}
                />
                {errors.newEmail && (
                  <span role="alert" className={errorTextClass}>
                    {errors.newEmail.message}
                  </span>
                )}
              </label>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium text-white">
              <span>New password</span>
              {isAdmin && (
                <span className="font-normal text-xs text-neutral-400">
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
                <span role="alert" className={errorTextClass}>
                  {errors.newPassword.message}
                </span>
              )}
            </label>

            <div className="flex justify-end border-t border-neutral-800 pt-5">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="h-10 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
