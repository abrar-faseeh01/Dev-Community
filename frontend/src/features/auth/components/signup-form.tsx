"use client";

import { PasswordInput } from "@/components/forms/password-input";
import { ROUTES } from "@/constants/routes";
import { useSignup } from "@/features/auth/mutations/auth-mutations";
import {
  signupSchema,
  type SignupFormValues,
} from "@/features/auth/schemas/auth-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

export function SignupForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  const signupMutation = useSignup();

  function onSubmit(values: SignupFormValues) {
    if (signupMutation.isPending) return;
    signupMutation.mutate(
      {
        fullName: values.fullName.trim(),
        email: values.email,
        password: values.password,
      },
      { onSuccess: () => router.push(ROUTES.POSTS) },
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Join the community
          </h1>
          <p className="mt-2 text-sm text-muted">
            Create an account and start connecting with developers.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-5 p-6 sm:p-8"
          >
            {signupMutation.isError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                {signupMutation.error instanceof Error
                  ? signupMutation.error.message
                  : "Signup failed."}
              </p>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Full name</span>
              <input
                type="text"
                aria-invalid={errors.fullName ? "true" : "false"}
                {...register("fullName")}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
              {errors.fullName && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.fullName.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Email</span>
              <input
                type="email"
                aria-invalid={errors.email ? "true" : "false"}
                {...register("email")}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
              {errors.email && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.email.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Password</span>
              <PasswordInput
                placeholder="Minimum 8 characters"
                aria-invalid={errors.password ? "true" : "false"}
                {...register("password")}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
              {errors.password && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.password.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Confirm password</span>
              <PasswordInput
                aria-invalid={errors.confirmPassword ? "true" : "false"}
                {...register("confirmPassword")}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
              {errors.confirmPassword && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.confirmPassword.message}
                </span>
              )}
            </label>

            <button
              type="submit"
              disabled={signupMutation.isPending}
              className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signupMutation.isPending ? "Creating account…" : "Create account"}
            </button>

            <p className="border-t border-border pt-5 text-center text-sm text-muted">
              Already have an account?{" "}
              <Link
                href={ROUTES.LOGIN}
                className="font-medium text-accent hover:underline"
              >
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
