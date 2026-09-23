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
    <main className="flex flex-1 flex-col items-center justify-center bg-neutral-950 px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 flex items-center gap-2 text-base font-bold tracking-tight text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-sm font-bold text-neutral-950">
              &lt;/&gt;
            </span>
            Dev Community
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            New here?{" "}
            <Link
              href={ROUTES.SIGNUP}
              className="font-medium text-emerald-400 hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-6"
        >
          {loginMutation.isError && (
            <p
              role="alert"
              className="rounded-lg border border-red-900/50 bg-red-950/60 px-3.5 py-3 text-sm text-red-300"
            >
              {loginMutation.error instanceof Error
                ? loginMutation.error.message
                : "Login failed."}
            </p>
          )}

          <label className="flex flex-col gap-2 text-sm font-semibold text-white">
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              aria-invalid={errors.email ? "true" : "false"}
              {...register("email")}
              className="h-12 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
            {errors.email && (
              <span role="alert" className="text-sm text-red-400">
                {errors.email.message}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-white">
            <span>Password</span>
            <PasswordInput
              aria-invalid={errors.password ? "true" : "false"}
              {...register("password")}
              className="h-12 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-white outline-none transition-shadow focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
            {errors.password && (
              <span role="alert" className="text-sm text-red-400">
                {errors.password.message}
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="h-12 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loginMutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-10 text-center text-xs text-neutral-600">
          © 2026 Dev Community
        </p>
      </div>
    </main>
  );
}
