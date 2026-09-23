"use client";

import { useAuditLog } from "@/features/audit/queries/audit-queries";
import type { AuditLogEntry } from "@/features/audit/types/audit";
import {
  diffAuditStates,
  stableStringify,
  type DiffCell,
  type DiffRow,
} from "@/features/audit/utils/audit-diff";
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

// Only the actions that remove something get the red pill (matching the
// mockup's "Removed post" / "Removed comment" / "Deleted user"); every
// other action — all of them edits, not removals — gets the same neutral
// pill already used for the "User" role badge on Admin Users.
const DESTRUCTIVE_ACTIONS = new Set<AuditLogEntry["action"]>([
  "delete_post",
  "delete_comment",
  "delete_user",
  "remove_experience",
]);

function actionPillClass(action: AuditLogEntry["action"]) {
  return DESTRUCTIVE_ACTIONS.has(action)
    ? "inline-block whitespace-nowrap rounded-full border border-red-800/50 bg-red-950/60 px-3 py-1 text-xs font-semibold text-red-400"
    : "inline-block whitespace-nowrap rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300";
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// One line of a diffed panel. `side` decides which cell (before/after) this
// column reads and how a changed cell is colored; a null cell renders as a
// blank filler row so the two columns stay aligned line-for-line.
function DiffLine({ cell, side }: { cell: DiffCell; side: "before" | "after" }) {
  if (!cell) {
    return (
      <div aria-hidden="true" className="px-3 py-0.5">
        &nbsp;
      </div>
    );
  }

  const changed = cell.changed;
  const colorClass = !changed
    ? "text-neutral-300"
    : side === "before"
      ? "border-l-2 border-red-400 bg-red-950/40 text-red-100"
      : "border-l-2 border-emerald-400 bg-emerald-950/40 text-emerald-100";

  return (
    <div className={`flex gap-2 px-3 py-0.5 ${colorClass}`}>
      <span aria-hidden="true" className="select-none text-neutral-500">
        {changed ? (side === "before" ? "-" : "+") : " "}
      </span>
      {changed && (
        <span className="sr-only">
          {side === "before" ? "Removed: " : "Added: "}
        </span>
      )}
      <span className="whitespace-pre-wrap break-words">{cell.text}</span>
    </div>
  );
}

function DiffPanel({
  label,
  rows,
  plainText,
  side,
}: {
  label: string;
  // Present together: exactly one of `rows` (diffable) or `plainText`
  // (either side was null, so there's nothing to diff against) is used.
  rows: DiffRow[] | null;
  plainText: string | null;
  side: "before" | "after";
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
        {rows ? (
          <div className="overflow-x-auto py-2 font-mono text-xs">
            {rows.map((row, i) => (
              <DiffLine key={i} cell={row[side]} side={side} />
            ))}
          </div>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-xs text-neutral-300">
            {plainText ?? "—"}
          </pre>
        )}
      </div>
    </div>
  );
}

function ChangeDetails({ entry }: { entry: AuditLogEntry }) {
  const rows = diffAuditStates(entry.previousState, entry.newState);
  const beforeText = entry.previousState
    ? stableStringify(entry.previousState)
    : null;
  const afterText = entry.newState ? stableStringify(entry.newState) : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <DiffPanel label="Before" rows={rows} plainText={beforeText} side="before" />
      <DiffPanel label="After" rows={rows} plainText={afterText} side="after" />
    </div>
  );
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
    <main className="flex flex-1 justify-center bg-neutral-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-4xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-emerald-400">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Audit log
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Every admin action, with the reason given at the time.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {loading && (
            <p className="p-6 text-sm text-neutral-400">Loading audit log…</p>
          )}

          {!loading && loadError && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300 sm:m-6"
            >
              {loadError}
            </p>
          )}

          {!loading && !loadError && entries && entries.length === 0 && (
            <p className="p-6 text-sm text-neutral-400">
              No audit entries yet.
            </p>
          )}

          {!loading && !loadError && entries && entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-xs font-semibold uppercase tracking-wide text-neutral-400">
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
                        <tr className="border-b border-neutral-800 last:border-b-0 transition-colors hover:bg-neutral-800/60">
                          <td className="whitespace-nowrap px-5 py-3.5 text-neutral-400 sm:px-6">
                            {formatTimestamp(entry.createdAt)}
                          </td>
                          <td className="px-5 py-3.5 font-medium text-white sm:px-6">
                            {entry.adminFullName}
                          </td>
                          <td className="px-5 py-3.5 sm:px-6">
                            <span className={actionPillClass(entry.action)}>
                              {ACTION_LABELS[entry.action] ?? entry.action}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-white sm:px-6">
                            {entry.targetFullName}
                          </td>
                          <td className="px-5 py-3.5 text-neutral-400 sm:px-6">
                            {entry.reason || "—"}
                          </td>
                          <td className="px-5 py-3.5 sm:px-6">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : entry._id)
                              }
                              className="font-medium text-emerald-400 hover:underline"
                            >
                              {isExpanded ? "Hide details" : "View details"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-neutral-800 bg-neutral-950/40 last:border-b-0">
                            <td colSpan={6} className="px-5 py-4 sm:px-6">
                              <ChangeDetails entry={entry} />
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
