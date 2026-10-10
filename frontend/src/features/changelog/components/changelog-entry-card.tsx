import type { ChangelogEntry } from "@/features/changelog/types/changelog";
import { PrBody } from "./pr-body";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChangelogEntryCard({ entry }: { entry: ChangelogEntry }) {
  return (
    <li className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
      <header className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold text-neutral-300">
              #{entry.prNumber}
            </span>
            <span className="rounded-full border border-emerald-800/50 bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              Merged into {entry.baseBranch}
            </span>
          </div>
          <h2 className="mt-2 break-words text-lg font-semibold text-white">
            {entry.title}
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            <span className="font-medium text-neutral-300">
              {entry.authorLogin}
            </span>{" "}
            merged{" "}
            <time dateTime={entry.mergedAt}>{formatDate(entry.mergedAt)}</time>{" "}
            · {entry.owner}/{entry.repo}
          </p>
        </div>
        <a
          href={entry.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 self-start rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
        >
          View on GitHub ↗
        </a>
      </header>

      <section
        aria-label="Pull request description"
        className="border-t border-neutral-800 bg-neutral-900/60 p-5"
      >
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Description
        </h3>
        <PrBody body={entry.body} />
      </section>
    </li>
  );
}
