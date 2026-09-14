"use client";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/lib/auth/auth-context";
import { useState } from "react";

export default function SettingsPage() {
  const { user, updateCredentials } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await updateCredentials(
        currentPassword,
        newFullName || undefined,
        newEmail || undefined,
        newPassword || undefined,
      );
      setSuccess("Account updated.");
      setCurrentPassword("");
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update account.",
      );
    }
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

          <form onSubmit={onSubmit} className="flex flex-col gap-5 p-5 sm:p-6">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            {success && (
              <p
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700"
              >
                {success}
              </p>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Full name</span>
              <input
                type="text"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder={user?.fullName}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>Current password</span>
              <PasswordInput
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            {user?.role === "admin" && (
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>New email</span>

                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
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
                minLength={8}
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </label>

            <div className="flex justify-end border-t border-border pt-5">
              <button
                type="submit"
                className="h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30"
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
