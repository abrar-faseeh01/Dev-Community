"use client";

import { PasswordInput } from "@/components/forms/password-input";
import { ROUTES } from "@/constants/routes";
import { useLogin } from "@/features/auth/mutations/auth-mutations";
import {
  loginSchema,
  type LoginFormValues,
} from "@/features/auth/schemas/auth-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

export function LoginForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const loginMutation = useLogin();

  function onSubmit(values: LoginFormValues) {
    if (loginMutation.isPending) return;
    loginMutation.mutate(values, {
      onSuccess: () => router.push(ROUTES.POSTS),
    });
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted">
            Log in to continue to the developer community.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-5 p-6 sm:p-8"
          >
            {loginMutation.isError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                {loginMutation.error instanceof Error
                  ? loginMutation.error.message
                  : "Login failed."}
              </p>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Email</span>
              <input
                type="email"
                aria-invalid={errors.email ? "true" : "false"}
                {...register("email")}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15"
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
                aria-invalid={errors.password ? "true" : "false"}
                {...register("password")}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
              {errors.password && (
                <span role="alert" className="text-sm text-red-600">
                  {errors.password.message}
                </span>
              )}
            </label>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loginMutation.isPending ? "Logging in…" : "Log in"}
            </button>

            <p className="border-t border-border pt-5 text-center text-sm text-muted">
              New to Dev Community?{" "}
              <Link
                href={ROUTES.SIGNUP}
                className="font-medium text-accent hover:underline"
              >
                Create an account
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
