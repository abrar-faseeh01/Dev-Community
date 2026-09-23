"use client";

import { Avatar } from "@/components/common/avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ROUTES } from "@/constants/routes";
import { useRequireAdmin } from "@/features/auth/hooks/use-require-auth";
import { useDeleteUser } from "@/features/users/mutations/user-mutations";
import { useUsers } from "@/features/users/queries/user-queries";
import type { AdminUser } from "@/features/users/types/admin-user";
import Link from "next/link";
import { useState } from "react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AdminUsersView() {
  // UX-only guard — the backend's @Roles('admin') on GET/DELETE /users is
  // the real boundary. This just avoids flashing the page at a non-admin.
  const { user, loading: authLoading } = useRequireAdmin();
  const isAdmin = !authLoading && user?.role === "admin";
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

  const usersQuery = useUsers({ enabled: isAdmin });
  const users = usersQuery.data ?? null;
  const loading = usersQuery.isPending;
  const loadError = usersQuery.isError
    ? usersQuery.error instanceof Error
      ? usersQuery.error.message
      : "Failed to load users."
    : "";

  const deleteMutation = useDeleteUser();
  const deletingId = deleteMutation.isPending
    ? (deleteMutation.variables?.id ?? null)
    : null;
  // The backend's own message is already specific — e.g. "Admin accounts
  // cannot be deleted" for a 403 — so it is shown as-is.
  const deleteError = deleteMutation.isError
    ? deleteMutation.error instanceof Error
      ? deleteMutation.error.message
      : "Failed to delete user."
    : "";

  function confirmDelete(reason?: string) {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    deleteMutation.mutate({ id: target.id, reason });
  }

  if (authLoading || !user || user.role !== "admin") {
    return null;
  }

  return (
    <main className="flex flex-1 justify-center bg-neutral-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-4xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-emerald-400">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            All users
          </h1>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {loading && (
            <p className="p-6 text-sm text-neutral-400">Loading users…</p>
          )}

          {!loading && loadError && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300 sm:m-6"
            >
              {loadError}
            </p>
          )}

          {!loading && !loadError && users && users.length === 0 && (
            <p className="p-6 text-sm text-neutral-400">No users found.</p>
          )}

          {!loading && !loadError && users && users.length > 0 && (
            <>
              {deleteError && (
                <p
                  role="alert"
                  className="m-5 rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300 sm:m-6 sm:mb-0"
                >
                  {deleteError}
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      <th className="px-5 py-3 sm:px-6">Full name</th>
                      <th className="px-5 py-3 sm:px-6">Email</th>
                      <th className="px-5 py-3 sm:px-6">Role</th>
                      <th className="px-5 py-3 sm:px-6">Joined</th>
                      <th className="px-5 py-3 sm:px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => {
                      const isRowAdmin = row.role === "admin";
                      const isDeleting = deletingId === row.id;
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-neutral-800 last:border-b-0 transition-colors hover:bg-neutral-800/60"
                        >
                          <td className="px-5 py-3.5 sm:px-6">
                            <div className="flex items-center gap-3">
                              <Avatar name={row.fullName} size="sm" />
                              <span className="font-medium text-white">
                                {row.fullName}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-neutral-400 sm:px-6">
                            {row.email}
                          </td>
                          <td className="px-5 py-3.5 sm:px-6">
                            {isRowAdmin ? (
                              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                                Admin
                              </span>
                            ) : (
                              <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300">
                                User
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-neutral-400 sm:px-6">
                            {formatDate(row.createdAt)}
                          </td>
                          <td className="px-5 py-3.5 sm:px-6">
                            <div className="flex items-center gap-4">
                              <Link
                                href={
                                  isRowAdmin
                                    ? ROUTES.SETTINGS
                                    : ROUTES.profileEdit(row.id)
                                }
                                className="font-medium text-emerald-400 hover:underline"
                              >
                                Edit
                              </Link>
                              {isRowAdmin ? (
                                <span
                                  title="Admin accounts can't be deleted"
                                  className="cursor-not-allowed font-medium text-neutral-500"
                                >
                                  Delete
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => setPendingDelete(row)}
                                  className="font-medium text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isDeleting ? "Deleting…" : "Delete"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete user"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.fullName} (${pendingDelete.email})? This cannot be undone.`
            : ""
        }
        showReasonInput
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  );
}
