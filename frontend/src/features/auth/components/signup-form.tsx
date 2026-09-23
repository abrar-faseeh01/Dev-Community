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

const MARKETING_POINTS = [
  "A profile built from your skills, experience, and portfolio",
  "Publish posts and discuss them in threaded comments",
  "Free for every developer — no paywalls, ever",
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-emerald-400"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

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
    <main className="flex flex-1 flex-col bg-neutral-950 lg:flex-row">
      {/* Marketing panel — hidden below `lg`, since the mockup is a desktop
          split-screen with no stacked-mobile reference to go on; the form
          alone carries the page on small screens. */}
      <div className="relative hidden overflow-hidden border-neutral-800 bg-gradient-to-br from-emerald-950/40 via-neutral-950 to-neutral-950 px-10 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:border-r xl:px-16">
        <span className="flex items-center gap-2 text-base font-bold tracking-tight text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-sm font-bold text-neutral-950">
            &lt;/&gt;
          </span>
          Dev Community
        </span>

        <div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
            Share what you build. Get feedback that matters.
          </h2>

          <ul className="mt-8 flex flex-col gap-3">
            {MARKETING_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-neutral-300">
                <CheckIcon />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-neutral-600">© 2026 Dev Community</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8 sm:py-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Already have one?{" "}
              <Link
                href={ROUTES.LOGIN}
                className="font-medium text-emerald-400 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-6"
          >
            {signupMutation.isError && (
              <p
                role="alert"
                className="rounded-lg border border-red-900/50 bg-red-950/60 px-3.5 py-3 text-sm text-red-300"
              >
                {signupMutation.error instanceof Error
                  ? signupMutation.error.message
                  : "Signup failed."}
              </p>
            )}

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              <span>Full name</span>
              <input
                type="text"
                placeholder="Jane Doe"
                aria-invalid={errors.fullName ? "true" : "false"}
                {...register("fullName")}
                className="h-12 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
              {errors.fullName && (
                <span role="alert" className="text-sm text-red-400">
                  {errors.fullName.message}
                </span>
              )}
            </label>

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
                placeholder="Minimum 8 characters"
                aria-invalid={errors.password ? "true" : "false"}
                {...register("password")}
                className="h-12 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
              {errors.password && (
                <span role="alert" className="text-sm text-red-400">
                  {errors.password.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              <span>Confirm password</span>
              <PasswordInput
                aria-invalid={errors.confirmPassword ? "true" : "false"}
                {...register("confirmPassword")}
                className="h-12 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-white outline-none transition-shadow focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
              {errors.confirmPassword && (
                <span role="alert" className="text-sm text-red-400">
                  {errors.confirmPassword.message}
                </span>
              )}
            </label>

            <button
              type="submit"
              disabled={signupMutation.isPending}
              className="h-12 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signupMutation.isPending ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-neutral-600 lg:hidden">
            © 2026 Dev Community
          </p>
        </div>
      </div>
    </main>
  );
}
