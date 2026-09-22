"use client";

import { useAuditLog } from "@/features/audit/queries/audit-queries";
import type { AuditLogEntry } from "@/features/audit/types/audit";
import { useRequireAdmin } from "@/features/auth/hooks/use-require-auth";
import { Fragment, useState } from "react";

const ACTION_LABELS: Record<AuditLogEntry["action"], string> = {
  update_skills: "Updated skills",
  add_experience: "Added experience",
  update_experience: "Updated experience",
  remove_experience: "Removed experience",
  update_fullname: "Updated full name",
  update_headline: "Updated headline",
  update_bio: "Updated bio",
  update_portfolio_projects: "Updated portfolio projects",
  update_post: "Updated post",
  delete_post: "Deleted post",
  delete_comment: "Deleted comment",
  delete_user: "Deleted user",
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogView() {
  // UX-only guard — the backend's @Roles('admin') on GET /admin/audit-log
  // is the real boundary. This just avoids flashing the page at a non-admin.
  const { user, loading: authLoading } = useRequireAdmin();
  const isAdmin = !authLoading && user?.role === "admin";
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logQuery = useAuditLog({ enabled: isAdmin });
  const entries = logQuery.data ?? null;
  const loading = logQuery.isPending;
  const loadError = logQuery.isError
    ? logQuery.error instanceof Error
      ? logQuery.error.message
      : "Failed to load audit log."
    : "";

  if (authLoading || !user || user.role !== "admin") {
    return null;
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-4xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {loading && (
            <p className="p-6 text-sm text-muted">Loading audit log…</p>
          )}

          {!loading && loadError && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 sm:m-6"
            >
              {loadError}
            </p>
          )}

          {!loading && !loadError && entries && entries.length === 0 && (
            <p className="p-6 text-sm text-muted">No audit entries yet.</p>
          )}

          {!loading && !loadError && entries && entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 sm:px-6">Timestamp</th>
                    <th className="px-5 py-3 sm:px-6">Admin</th>
                    <th className="px-5 py-3 sm:px-6">Action</th>
                    <th className="px-5 py-3 sm:px-6">Target</th>
                    <th className="px-5 py-3 sm:px-6">Reason</th>
                    <th className="px-5 py-3 sm:px-6" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isExpanded = expandedId === entry._id;
                    return (
                      <Fragment key={entry._id}>
                        <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-background">
                          <td className="whitespace-nowrap px-5 py-3.5 text-muted sm:px-6">
                            {formatTimestamp(entry.createdAt)}
                          </td>
                          <td className="px-5 py-3.5 font-medium text-foreground sm:px-6">
                            {entry.adminFullName}
                          </td>
                          <td className="px-5 py-3.5 text-foreground sm:px-6">
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </td>
                          <td className="px-5 py-3.5 text-foreground sm:px-6">
                            {entry.targetFullName}
                          </td>
                          <td className="px-5 py-3.5 text-muted sm:px-6">
                            {entry.reason || "—"}
                          </td>
                          <td className="px-5 py-3.5 sm:px-6">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : entry._id)
                              }
                              className="font-medium text-accent hover:underline"
                            >
                              {isExpanded ? "Hide details" : "View details"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-border bg-background last:border-b-0">
                            <td colSpan={6} className="px-5 py-4 sm:px-6">
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                                    Before
                                  </p>
                                  <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-3 text-xs text-foreground">
                                    {JSON.stringify(
                                      entry.previousState,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                                <div>
                                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                                    After
                                  </p>
                                  <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-3 text-xs text-foreground">
                                    {JSON.stringify(entry.newState, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
