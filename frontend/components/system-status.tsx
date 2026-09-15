"use client";

import { apiFetch } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";

type HealthData = { api: string; database: string };

async function fetchHealth(): Promise<HealthData> {
  const res = await apiFetch<HealthData>("/health");
  return res.data;
}

export function SystemStatus() {
  const { data, error, isLoading, isError, isFetching, failureCount, refetch } =
    useQuery({
      queryKey: ["health"],
      queryFn: fetchHealth,
    });

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted"
      >
        {failureCount > 0
          ? `Retrying… (attempt ${failureCount + 1})`
          : "Checking system status…"}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm"
      >
        <div>
          <p className="font-semibold text-red-700">System unavailable</p>
          <p className="text-red-600">
            {error instanceof Error ? error.message : "Service unavailable."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm">
      <p className="font-semibold text-green-700">
        System connected{isFetching ? " (refreshing…)" : ""}
      </p>
      <p className="text-green-700">API: {data.api}</p>
      <p className="text-green-700">Database: {data.database}</p>
    </div>
  );
}
