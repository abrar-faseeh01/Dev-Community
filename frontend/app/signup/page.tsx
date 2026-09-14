"use client";
import { useAuth } from "@/lib/auth/auth-context";
import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const { signup } = useAuth();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (fullName.trim().length < 2) {
      setError("Full name must be at least 2 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      await signup(fullName.trim(), email, password);
      router.push("/");
    } catch {
      setError("Signup failed — email may already be in use");
    }
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
          <form onSubmit={onSubmit} className="flex flex-col gap-5 p-6 sm:p-8">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Full name</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Password</span>
              <PasswordInput
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Confirm password</span>
              <PasswordInput
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <button
              type="submit"
              className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              Create account
            </button>

            <p className="border-t border-border pt-5 text-center text-sm text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
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
