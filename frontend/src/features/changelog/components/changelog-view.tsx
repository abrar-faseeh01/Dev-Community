"use client";

import { useRequireAuth } from "@/features/auth/hooks/use-require-auth";
import { ChangelogEntryCard } from "@/features/changelog/components/changelog-entry-card";
import { useSyncChangelog } from "@/features/changelog/mutations/changelog-mutations";
import { useChangelog } from "@/features/changelog/queries/changelog-queries";
import {
  syncChangelogSchema,
  type SyncChangelogValues,
} from "@/features/changelog/schemas/changelog-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

function SyncForm() {
  const sync = useSyncChangelog();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SyncChangelogValues>({
    resolver: zodResolver(syncChangelogSchema),
  });

  function onSubmit(values: SyncChangelogValues) {
    if (sync.isPending) return;
    sync.mutate(values.repo);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mb-6 flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <input
          {...register("repo")}
          aria-label="Repository"
          placeholder="owner/repo"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={sync.isPending}
          className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-300 disabled:opacity-60"
        >
          {sync.isPending ? "Syncing…" : "Sync"}
        </button>
      </div>
      {errors.repo && (
        <p role="alert" className="text-sm text-red-400">
          {errors.repo.message}
        </p>
      )}
      {sync.isError && (
        <p role="alert" className="text-sm text-red-400">
          {sync.error.message}
        </p>
      )}
      {sync.isSuccess && sync.data === null && (
        <p className="text-sm text-neutral-400">
          No pull request has been merged into main in that repository.
        </p>
      )}
    </form>
  );
}

export function ChangelogView() {
  const { user } = useRequireAuth();
  const { data, isPending, isError, error, refetch } = useChangelog({
    enabled: Boolean(user),
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">
        Changelog
      </h1>

      {user?.role === "admin" && <SyncForm />}

      {isPending ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : isError ? (
        <div role="alert" className="text-sm text-red-400">
          <p>{error.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 underline"
          >
            Try again
          </button>
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Nothing here yet.
          {user?.role === "admin" && " Sync a repository to add its latest merged PR."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.map((entry) => (
            <ChangelogEntryCard key={entry._id} entry={entry} />
          ))}
        </ul>
      )}
    </main>
  );
}
