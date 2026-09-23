"use client";

import { useHealth } from "@/features/health/queries/health-queries";

function ServerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function formatCheckedTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const refreshButtonClass =
  "flex shrink-0 items-center gap-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60";

const connectedPillClass =
  "flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300";

export function SystemStatus() {
  const {
    data,
    error,
    isLoading,
    isError,
    isFetching,
    failureCount,
    refetch,
    dataUpdatedAt,
  } = useHealth();

  return (
    <main className="flex flex-1 items-center justify-center bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
        {isLoading && (
          <div role="status" aria-live="polite" className="text-sm text-neutral-400">
            {failureCount > 0
              ? `Retrying… (attempt ${failureCount + 1})`
              : "Checking system status…"}
          </div>
        )}

        {!isLoading && isError && (
          <div role="alert">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white">System status</h1>
                <p className="mt-1 text-sm font-semibold text-red-400">
                  System unavailable
                </p>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className={refreshButtonClass}
              >
                <RefreshIcon />
                {isFetching ? "Retrying…" : "Retry"}
              </button>
            </div>
            <p className="mt-4 rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300">
              {error instanceof Error ? error.message : "Service unavailable."}
            </p>
          </div>
        )}

        {!isLoading && !isError && data && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white">System status</h1>
                <p className="mt-1 font-mono text-sm text-neutral-400">
                  Checked {formatCheckedTime(dataUpdatedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className={refreshButtonClass}
              >
                <RefreshIcon />
                {isFetching ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div
              role="status"
              className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-300"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              All systems operational
            </div>

            <div className="mt-5 flex flex-col divide-y divide-neutral-800">
              <div className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300">
                    <ServerIcon />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      API server
                    </p>
                    <p className="text-xs text-neutral-400">
                      NestJS · /health
                    </p>
                  </div>
                </div>
                <span className={connectedPillClass}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {data.api === "ok" ? "Connected" : data.api}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300">
                    <DatabaseIcon />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Database
                    </p>
                    <p className="text-xs text-neutral-400">
                      MongoDB · Mongoose
                    </p>
                  </div>
                </div>
                <span className={connectedPillClass}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {data.database === "connected" ? "Connected" : data.database}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
